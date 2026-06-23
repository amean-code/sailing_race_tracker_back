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

export function getAllowedOrigins(config: ConfigService): string[] {
  const fromList = parseOrigins(config.get<string>('CORS_ORIGINS'));
  const fromFrontend = parseOrigins(config.get<string>('FRONTEND_URL'));
  const merged = [...fromList, ...fromFrontend];
  return merged.length > 0 ? [...new Set(merged)] : DEFAULT_ORIGINS;
}

export function getCorsOptions(config: ConfigService): CorsOptions {
  const allowedOrigins = getAllowedOrigins(config);

  return {
    origin: (origin, callback) => {
      // Same-origin requests (e.g. server-to-server, curl) have no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
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
