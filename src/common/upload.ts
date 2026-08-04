import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const UPLOADS_ROOT = join(process.cwd(), 'uploads');
export const CERTIFICATES_DIR = 'certificates';
export const RECEIPTS_DIR = 'receipts';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function ensureUploadDirs() {
  for (const dir of [CERTIFICATES_DIR, RECEIPTS_DIR]) {
    const full = join(UPLOADS_ROOT, dir);
    if (!existsSync(full)) mkdirSync(full, { recursive: true });
  }
}

export function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new BadRequestException('Sadece PDF, JPG, PNG veya WEBP yüklenebilir') as unknown as Error, false);
  }
  cb(null, true);
}

export function createUploadStorage(subdir: string) {
  ensureUploadDirs();
  return diskStorage({
    destination: (_req, _file, cb) => {
      const dest = join(UPLOADS_ROOT, subdir);
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || mimeToExt(file.mimetype);
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return '.pdf';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

export function relativeUploadPath(subdir: string, filename: string): string {
  return `${subdir}/${filename}`;
}

export function absoluteUploadPath(relativePath: string): string {
  return join(UPLOADS_ROOT, relativePath);
}

export function deleteUploadFile(relativePath: string | null | undefined) {
  if (!relativePath) return;
  const full = absoluteUploadPath(relativePath);
  if (existsSync(full)) {
    try {
      unlinkSync(full);
    } catch {
      // ignore cleanup errors
    }
  }
}

export const UPLOAD_LIMITS = { fileSize: MAX_FILE_BYTES };
