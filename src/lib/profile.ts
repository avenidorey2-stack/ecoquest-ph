/** Days a user must wait between city changes (stops hopping cities to bypass geofencing). */
export const LOCATION_COOLDOWN_DAYS = 30;

export const MAX_NAME_LENGTH = 60;

export function nextLocationChange(locationUpdatedAt: Date | null) {
  return locationUpdatedAt ? new Date(locationUpdatedAt.getTime() + LOCATION_COOLDOWN_DAYS * 86_400_000) : null;
}
