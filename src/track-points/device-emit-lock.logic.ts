/**
 * PostgreSQL advisory-lock namespace for device live-emit watermark transactions.
 * Second int key isolates this feature from other hashtext(boat_id) locks.
 */
export const DEVICE_EMIT_ADVISORY_LOCK_NAMESPACE = 872_014;

/** SQL fragment used with QueryRunner/manager.query — $1 = boatId. */
export const DEVICE_EMIT_ADVISORY_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtext($1::text), $2::int)';
