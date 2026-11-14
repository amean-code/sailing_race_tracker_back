/** Max distance (m) from a mark to count as passed (buoy drift / GPS jitter). */
export const CHECKPOINT_PROXIMITY_TOLERANCE_M = 5;

export const APP_NAME = 'Themis Race Tracker';
export const API_NAME = 'Themis Race Tracker API';
export const AUTH_COOKIE = 'themis_session';
export const JWT_EXPIRY = '7d';

export const USER_ROLES = ['SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN', 'SPECTATOR'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export enum UserRoleEnum {
  SAILOR = 'SAILOR',
  COMMITTEE = 'COMMITTEE',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  SPECTATOR = 'SPECTATOR',
}

export enum UserStatusEnum {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export enum RaceStatusEnum {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  SUSPENDED = 'SUSPENDED',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
}

/** @deprecated Use LegKindEnum — kept for migration compatibility */
export enum RaceTypeEnum {
  REGATA = 'REGATA',
  TROFE_LEG = 'TROFE_LEG',
}

export enum LegKindEnum {
  TROFE_LEG = 'TROFE_LEG',
  REGATA = 'REGATA',
  SINGLE = 'SINGLE',
}

export enum RaceResultStatusEnum {
  PENDING = 'PENDING',
  FINISHED = 'FINISHED',
  DNS = 'DNS',
  DNF = 'DNF',
  DSQ = 'DSQ',
}

export enum TrophyStatusEnum {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
}

export enum CourseStatusEnum {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum ApplicationStatusEnum {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  CHECKED_IN = 'CHECKED_IN',
  WITHDRAWN = 'WITHDRAWN',
  DNS = 'DNS',
  DNF = 'DNF',
  DSQ = 'DSQ',
}

export enum CertificateTypeEnum {
  IRC = 'IRC',
  ORC = 'ORC',
  INSURANCE = 'INSURANCE',
  SKIPPER_LICENSE = 'SKIPPER_LICENSE',
  MEASUREMENT = 'MEASUREMENT',
  OTHER = 'OTHER',
}

export enum DeviceStatusEnum {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum DeviceAssignmentStatusEnum {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
  REPLACED = 'REPLACED',
}

/** Provenance for track_points / live GPS events — nullable in DB for legacy rows. */
export enum TrackPointSourceEnum {
  PWA = 'pwa',
  DEVICE = 'device',
}

/**
 * Assigned ACTIVE device is "live" within this window:
 * PWA sync is suppressed and sailor map prefers device
 * (unless the sailor has opted into phone as the active source).
 */
export const DEVICE_LIVE_MAX_AGE_MS = 30_000;

/**
 * How long a sailor "prefer phone" sync signal keeps device GPS from
 * driving race-engine / live fleet broadcasts. Refreshed on each phone sync;
 * keep short so switching back to Device resumes device live emits quickly.
 */
export const PHONE_SOURCE_PREFERENCE_TTL_MS = 15_000;

/**
 * Device TrackPoints older than this (serverNow − recordedAt) may still persist
 * for playback/debug, but must not emit gps.received / race-engine live path.
 * Tunable constant — can move to config later without a schema change.
 */
export const DEVICE_LIVE_EMIT_MAX_AGE_MS = 120_000;

export enum PaymentStatusEnum {
  NONE = 'NONE',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum NotificationEventEnum {
  RACE_CREATED = 'RACE_CREATED',
  RACE_UPDATED = 'RACE_UPDATED',
  RACE_DELETED = 'RACE_DELETED',
  RACE_STATUS_CHANGED = 'RACE_STATUS_CHANGED',
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  USER_REGISTERED = 'USER_REGISTERED',
}

export enum NotificationAudienceEnum {
  APPLICANT = 'APPLICANT',
  SAILOR = 'SAILOR',
  COMMITTEE = 'COMMITTEE',
  ADMIN = 'ADMIN',
}

export const NOTIFICATION_EVENTS = Object.values(NotificationEventEnum);
export const NOTIFICATION_AUDIENCES = Object.values(NotificationAudienceEnum);
