import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { ConfigService } from '@nestjs/config';

const DEFAULT_ORIGINS = ['http://localhost:5173'];

function parseOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[,;]/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Her origin için www ve www'suz versiyonunu otomatik olarak ekler.
 * Örnek: https://themistracker.com → https://themistracker.com + https://www.themistracker.com
 */
function expandWwwVariants(origins: string[]): string[] {
  const expanded: string[] = [];
  for (const origin of origins) {
    expanded.push(origin);
    try {
      const url = new URL(origin);
      if (url.hostname.startsWith('www.')) {
        // www varsa → www'suz versiyonu da ekle
        url.hostname = url.hostname.slice(4);
        expanded.push(url.origin);
      } else if (!url.hostname.startsWith('localhost') && !url.hostname.match(/^\d/)) {
        // www yoksa → www'lu versiyonu da ekle (localhost ve IP'ler hariç)
        url.hostname = `www.${url.hostname}`;
        expanded.push(url.origin);
      }
    } catch {
      // Geçersiz URL'leri atla
    }
  }
  return expanded;
}

export function getAllowedOrigins(config: ConfigService): string[] {
  const fromList = parseOrigins(config.get<string>('CORS_ORIGINS'));
  const fromFrontend = parseOrigins(config.get<string>('FRONTEND_URL'));
  const merged = [...fromList, ...fromFrontend];
  const base = merged.length > 0 ? merged : DEFAULT_ORIGINS;
  return [...new Set(expandWwwVariants(base))];
}

function isDevLanOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
    origin,
  );
}

export function getCorsOptions(config: ConfigService): CorsOptions {
  const allowedOrigins = getAllowedOrigins(config);
  const isDev = config.get('NODE_ENV') !== 'production';

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, origin);
        return;
      }
      if (isDev && isDevLanOrigin(origin)) {
        callback(null, origin);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400,
  };
}
