# Walkthrough: Live Fleet Latest-Position Bug Fix

**Tarih:** 2026-09-26  
**Kapsam:** Race Control canlı haritasında bazı teknelerin GPS DB’de varken marker’larının kaybolması  
**Örnek:** Race `8489d4fa-…`, Boat TEMPO (`fb94d914-…` / TUR0648)

---

## Problem özeti

GPS ingestion ve PostgreSQL `track_points` doğruydu. Bug, live latest-position sorgusundaydı:

`findLatestByRace()` yarışın **global son 500** kaydını çekip JS’te boat başına ilk kaydı alıyordu. Yüksek frekanslı GPS bu pencereyi doldurunca TEMPO gibi düşük frekanslı tekneler Map’te yoktu → `position: null` → marker yok.

---

## Yapılan düzenlemeler

### 1. `findLatestByRace` — per-boat latest (DISTINCT ON)

**Dosya:** `sailing_race_tracker_back/src/track-points/track-points.service.ts`

| Önce | Sonra |
|------|--------|
| `findAll({ raceId, limit: 500 })` + Map | PostgreSQL `DISTINCT ON (boat_id)` |
| Global LIMIT penceresi | Her boat için bağımsız latest row |
| `limit = 500` parametresi | Parametre kaldırıldı (tek call-site limit geçirmiyordu) |

Yeni sorgu mantığı:

```ts
.createQueryBuilder('tp')
.distinctOn(['tp.boat_id'])
.where('tp.race_id = :raceId', { raceId })
.orderBy('tp.boat_id')
.addOrderBy('tp.recorded_at', 'DESC')
.addOrderBy('tp.id', 'DESC')  // tie-breaker
.getMany()
```

`findAll()` / `findLive()` **değiştirilmedi** (list endpoint’lerinin LIMIT davranışı korundu).

### 2. Pure helper (test + Map build)

**Dosya:** `sailing_race_tracker_back/src/track-points/find-latest-by-race.ts` *(yeni)*

- `selectLatestTrackPointsPerBoat` — DISTINCT ON semantiğinin DB’siz eşleniği
- `isNewerTrackPoint` — `recorded_at` + `id` tie-breaker
- `buildLatestByBoatMap` — satırları `Map<boatId, point>` yapar (service bunu kullanır)

### 3. Composite index + migration

**Entity:** `track-point.entity.ts`  
`@Index('track_points_race_id_boat_id_recorded_at_idx', ['raceId', 'boatId', 'recordedAt'])`

**Migration:** `1785600000000-TrackPointsRaceBoatRecordedAtIndex.ts`

```sql
CREATE INDEX IF NOT EXISTS "track_points_race_id_boat_id_recorded_at_idx"
ON "track_points" ("race_id", "boat_id", "recorded_at" DESC)
```

Önceki indexler (`boat_id, recorded_at`, `client_key`) aynı kaldı. `race_id` üzerinde index yoktu; live per-boat query için eklendi.

> Production DB’ye bu oturumda SQL mutation çalıştırılmadı. Index, migration deploy / `migration:run` ile uygulanır (`synchronize: true` ortamlarda entity index’i de oluşabilir).

### 4. Unit testler

**Dosya:** `find-latest-by-race.spec.ts` *(yeni)*  
**package.json:** `test` script’ine eklendi.

| # | Senaryo | Sonuç |
|---|---------|--------|
| 1 | 5 boat; global 500’de bazıları yok | 5 latest |
| 2 | 1 Hz vs 5 sn | düşük frekans kaybolmaz |
| 3 | Geç başlayan az point | latest döner |
| 4 | GPS’siz boat | Map’te yok; diğerleri OK |
| 5 | Aynı boat çok point | en yeni `recorded_at` |
| 6 | Aynı `recorded_at` | `id` tie-breaker |
| 7 | Farklı `race_id` | karışmaz |

### 5. Dokunulmayanlar

- Frontend (`useLiveFleet` vb.)
- `/competitors` response contract
- `RaceFleetService.getCompetitors` (aynı `latestByBoat.get(app.boatId)` akışı)
- `findAll` global pagination

---

## Implementation raporu (11 madde)

### 1. Değiştirilen dosyalar

| Dosya | İşlem |
|-------|--------|
| `src/track-points/track-points.service.ts` | `findLatestByRace` yeniden yazıldı |
| `src/track-points/find-latest-by-race.ts` | Yeni helper |
| `src/track-points/find-latest-by-race.spec.ts` | Yeni testler |
| `src/entities/track-point.entity.ts` | Composite `@Index` |
| `src/database/migrations/1785600000000-TrackPointsRaceBoatRecordedAtIndex.ts` | Yeni migration |
| `package.json` | Test script güncellendi |
| `docs/LIVE_FLEET_LATEST_POSITION_FIX_WALKTHROUGH.md` | Bu walkthrough |

### 2. Değiştirilen fonksiyonlar

- `TrackPointsService.findLatestByRace(raceId)` — imza: `limit` kaldırıldı
- Yeni: `selectLatestTrackPointsPerBoat`, `buildLatestByBoatMap`, `isNewerTrackPoint`

### 3. Önceki sorgu mantığı

```
findAll({ raceId, limit: 500 })
→ ORDER BY recorded_at DESC LIMIT 500
→ JS Map: her boatId için ilk (en yeni pencere içi) kayıt
```

Bir tekne pencereyi doldurursa diğer tekneler Map’e girmezdi.

### 4. Yeni sorgu mantığı

```
DISTINCT ON (boat_id)
WHERE race_id = ?
ORDER BY boat_id, recorded_at DESC, id DESC
→ her boat için tek latest row
→ Map<boatId, serialized TrackPoint>
```

### 5. Neden LIMIT problemini çözüyor

LIMIT artık “tüm filonun son N satırı” değil; SQL her `boat_id` için bağımsız en yeni satırı seçiyor. Bir teknenin GPS frekansı diğerlerinin görünürlüğünü etkilemez.

### 6. Kullanılan indexler

- Mevcut: `track_points_boat_id_recorded_at_idx` `(boat_id, recorded_at)`
- Mevcut: unique partial `client_key`
- **Yeni:** `track_points_race_id_boat_id_recorded_at_idx` `(race_id, boat_id, recorded_at DESC)`

### 7. Migration

`TrackPointsRaceBoatRecordedAtIndex1785600000000`  
`up`: CREATE INDEX IF NOT EXISTS …  
`down`: DROP INDEX IF EXISTS …

### 8. Eklenen testler

`find-latest-by-race.spec.ts` — 7 senaryo + `buildLatestByBoatMap` edge case (toplam 8 test bu dosyada).

### 9. Test sonuçları

```
npm test → 28 pass, 0 fail
(mevcut checkpoint testleri + yeni latest-by-race testleri)
```

### 10. API response contract

**Değişmedi.** `GET /races/:id/competitors` hâlâ:

```json
{ "competitors": [{ "application", "boat", "position", "displayColor" }] }
```

`position` null veya serialize track point. Alan isimleri aynı.

### 11. Diğer servis etkisi

`findLatestByRace` **yalnızca** `RaceFleetService.getCompetitors` tarafından çağrılıyor. Başka call-site yok; diğer servisler etkilenmedi. `findAll` call-site’ları aynı.

---

## Deploy notu

1. Backend deploy (kod + migration dosyası).
2. Ortama göre `npm run migration:run` (veya `synchronize: true` ile entity index’inin oluşmasını doğrula).
3. Race Control canlı haritada TEMPO / düşük frekanslı teknelerin sürekli görünürlüğünü smoke-test et.
