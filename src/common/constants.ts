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
  CLOSED = 'CLOSED',
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
