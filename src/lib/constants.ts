export const APP_NAME = "BAYK Tracker";
export const API_NAME = "BAYK Tracker API";

export const AUTH_COOKIE = "bayk_session";
export const JWT_EXPIRY = "7d";

export const USER_ROLES = ["SAILOR", "COMMITTEE", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];
