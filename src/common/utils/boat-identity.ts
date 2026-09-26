/**
 * Prefer live boat identity over application snapshot fields.
 * Keeps displays and exports consistent after boat name / sail number (TUR) renames.
 */
export function resolveApplicationBoatIdentity(app: {
  boatName?: string | null;
  sailNumber?: string | null;
  boat?: { name?: string | null; sailNumber?: string | null } | null;
}) {
  return {
    boatName: app.boat?.name || app.boatName || '',
    sailNumber: app.boat?.sailNumber || app.sailNumber || '',
  };
}
