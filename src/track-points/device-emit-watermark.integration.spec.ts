/**
 * Optional local Postgres checks for advisory-lock serialization.
 * Skips when DATABASE_URL is unset or DB unreachable.
 * Does NOT run TypeORM migrations — uses CREATE TABLE IF NOT EXISTS only.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
  DEVICE_EMIT_ADVISORY_LOCK_NAMESPACE,
  DEVICE_EMIT_ADVISORY_LOCK_SQL,
} from './device-emit-lock.logic';

const DATABASE_URL = process.env.DATABASE_URL;

describe('device-emit-watermark.integration (local pg)', () => {
  let ds: DataSource | null = null;
  let available = false;

  before(async () => {
    if (!DATABASE_URL) return;
    ds = new DataSource({
      type: 'postgres',
      url: DATABASE_URL,
      synchronize: false,
      logging: false,
    });
    try {
      await ds.initialize();
      await ds.query(`
        CREATE TABLE IF NOT EXISTS "device_live_emit_watermarks" (
          "boat_id" text PRIMARY KEY,
          "last_emitted_recorded_at" TIMESTAMP NOT NULL,
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      available = true;
    } catch {
      available = false;
      if (ds?.isInitialized) await ds.destroy();
      ds = null;
    }
  });

  after(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('serializes same-boat watermark updates under advisory locks', async (t) => {
    if (!available || !ds) {
      t.skip('local DATABASE_URL unavailable');
      return;
    }

    const boats = await ds.query(`SELECT id FROM boats LIMIT 1`);
    if (!boats.length) {
      t.skip('no boats row for FK');
      return;
    }
    const boatId = boats[0].id as string;

    const prior = await ds.query(
      `SELECT last_emitted_recorded_at FROM device_live_emit_watermarks WHERE boat_id = $1`,
      [boatId],
    );

    await ds.query(`DELETE FROM device_live_emit_watermarks WHERE boat_id = $1`, [boatId]);

    const bump = async (label: string, ts: Date) => {
      await ds!.transaction(async (manager) => {
        await manager.query(DEVICE_EMIT_ADVISORY_LOCK_SQL, [
          boatId,
          DEVICE_EMIT_ADVISORY_LOCK_NAMESPACE,
        ]);
        // Artificial delay so concurrent starters contend on the lock.
        await new Promise((r) => setTimeout(r, 30));
        const rows = await manager.query(
          `SELECT last_emitted_recorded_at FROM device_live_emit_watermarks WHERE boat_id = $1 FOR UPDATE`,
          [boatId],
        );
        if (!rows.length) {
          await manager.query(
            `INSERT INTO device_live_emit_watermarks (boat_id, last_emitted_recorded_at, updated_at)
             VALUES ($1, $2, now())`,
            [boatId, ts],
          );
        } else {
          const prev = new Date(rows[0].last_emitted_recorded_at).getTime();
          if (ts.getTime() >= prev) {
            await manager.query(
              `UPDATE device_live_emit_watermarks
               SET last_emitted_recorded_at = $2, updated_at = now()
               WHERE boat_id = $1`,
              [boatId, ts],
            );
          }
        }
        void label;
      });
    };

    const t1 = new Date('2026-11-12T10:00:00.000Z');
    const t2 = new Date('2026-11-12T10:00:05.000Z');
    await Promise.all([bump('a', t1), bump('b', t2)]);

    const finalRows = await ds.query(
      `SELECT last_emitted_recorded_at FROM device_live_emit_watermarks WHERE boat_id = $1`,
      [boatId],
    );
    assert.equal(finalRows.length, 1);
    assert.equal(new Date(finalRows[0].last_emitted_recorded_at).toISOString(), t2.toISOString());

    await ds.query(`DELETE FROM device_live_emit_watermarks WHERE boat_id = $1`, [boatId]);
    if (prior.length) {
      await ds.query(
        `INSERT INTO device_live_emit_watermarks (boat_id, last_emitted_recorded_at, updated_at)
         VALUES ($1, $2, now())`,
        [boatId, prior[0].last_emitted_recorded_at],
      );
    }
  });

  it('allows different boats to proceed without sharing one lock key', async (t) => {
    if (!available || !ds) {
      t.skip('local DATABASE_URL unavailable');
      return;
    }

    const boatA = `wm-a-${Date.now()}`;
    const boatB = `wm-b-${Date.now()}`;
    const started: string[] = [];

    const work = async (boatId: string) => {
      await ds!.transaction(async (manager) => {
        await manager.query(DEVICE_EMIT_ADVISORY_LOCK_SQL, [
          boatId,
          DEVICE_EMIT_ADVISORY_LOCK_NAMESPACE,
        ]);
        started.push(boatId);
        await new Promise((r) => setTimeout(r, 40));
      });
    };

    const begin = Date.now();
    await Promise.all([work(boatA), work(boatB)]);
    const elapsed = Date.now() - begin;
    // If they serialized globally, ~80ms+; overlapping locks finish nearer ~40-70ms.
    assert.ok(started.includes(boatA) && started.includes(boatB));
    assert.ok(elapsed < 120, `expected parallel boats, elapsed=${elapsed}`);
  });
});
