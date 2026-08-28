import { SessionUser } from '../decorators';

export function sanitizeCourseNameSegment(value: string): string {
  return (value || '')
    .trim()
    .replace(/\./g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

export function buildInternalCourseStorageName(
  refereeLabel: string,
  courseTitle: string,
): string {
  const ref = sanitizeCourseNameSegment(refereeLabel) || 'Hakem';
  const title = sanitizeCourseNameSegment(courseTitle) || 'Parkur';
  return `${ref}.${title}`;
}

export function parseInternalCourseStorageName(fullName: string): {
  refereePrefix: string | null;
  courseTitle: string;
} {
  const trimmed = (fullName || '').trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0) {
    return { refereePrefix: null, courseTitle: trimmed || 'Parkur' };
  }
  return {
    refereePrefix: trimmed.slice(0, dot),
    courseTitle: trimmed.slice(dot + 1).trim() || trimmed,
  };
}

export function displayCourseName(fullName: string): string {
  const { courseTitle } = parseInternalCourseStorageName(fullName);
  return courseTitle || (fullName || '').trim();
}

export function resolveRefereeLabel(user: SessionUser): string {
  const name = (user.name || '').trim();
  if (name) return name;
  const emailLocal = (user.email || '').split('@')[0]?.trim();
  return emailLocal || 'Hakem';
}

export function normalizeCourseNameForStorage(
  dtoName: string,
  user: SessionUser,
): string {
  const { courseTitle } = parseInternalCourseStorageName(dtoName);
  return buildInternalCourseStorageName(resolveRefereeLabel(user), courseTitle);
}
