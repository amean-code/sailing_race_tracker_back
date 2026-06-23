export const APP_NAME = 'BAYK Tracker';
export const API_NAME = 'BAYK Tracker API';
export const AUTH_COOKIE = 'bayk_session';
export const JWT_EXPIRY = '7d';

export const USER_ROLES = ['SAILOR', 'COMMITTEE', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export enum UserRoleEnum {
  SAILOR = 'SAILOR',
  COMMITTEE = 'COMMITTEE',
  ADMIN = 'ADMIN',
}

export enum RaceStatusEnum {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
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
