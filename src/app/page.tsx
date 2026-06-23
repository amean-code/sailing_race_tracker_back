import styles from "./page.module.css";
import { API_NAME, APP_NAME } from "@/lib/constants";

const endpoints = [
  { method: "GET", path: "/api/health", description: "Sağlık kontrolü ve DB durumu" },
  { method: "POST", path: "/api/auth/register", description: "Kayıt (role: SAILOR | COMMITTEE)" },
  { method: "POST", path: "/api/auth/login", description: "Giriş" },
  { method: "POST", path: "/api/auth/logout", description: "Çıkış" },
  { method: "GET", path: "/api/auth/me", description: "Aktif kullanıcı" },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <p className={styles.kicker}>sailing_race_tracker_back</p>
        <h1 className={styles.title}>
          <span className={styles.brandPrimary}>BAYK</span>
          <span className={styles.brandSuffix}> Tracker API</span>
        </h1>
        <p className={styles.lead}>
          {APP_NAME} frontend&apos;i için PostgreSQL destekli Next.js backend.
          Race (tekne) ve RC (komite) modülleriyle uyumlu kullanıcı rolleri.
        </p>

        <section className={styles.card}>
          <h2>Auth endpoints</h2>
          <ul className={styles.endpointList}>
            {endpoints.map((endpoint) => (
              <li key={endpoint.path}>
                <code className={styles.method}>{endpoint.method}</code>
                <code className={styles.path}>{endpoint.path}</code>
                <span>{endpoint.description}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card}>
          <h2>Veri modeli (frontend ile uyumlu)</h2>
          <ul className={styles.modelList}>
            <li>
              <strong>users</strong> — kimlik doğrulama (SAILOR, COMMITTEE, ADMIN)
            </li>
            <li>
              <strong>courses</strong> — parkur ve checkpoint&apos;ler (mockSupabase.courses)
            </li>
            <li>
              <strong>boats</strong> — tekne listesi (mockSupabase.boats)
            </li>
            <li>
              <strong>track_points</strong> — GPS iz kayıtları (mockSupabase.tracks)
            </li>
          </ul>
        </section>

        <p className={styles.footer}>
          {API_NAME} · Next.js 16 · PostgreSQL · Prisma
        </p>
      </main>
    </div>
  );
}
