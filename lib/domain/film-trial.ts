// These IDs identify the isolated Issue #43 projection, never a Role-wide status.
export const FILM_TRIAL_CLAIM_IDS = ["4c88b8e8-154d-47ad-bf82-f19876ecaebd", "34b41d23-f4e6-4fc6-aa6f-2905f3c2a890"] as const;
export function isFilmTrialClaim(enabled: boolean, id: string) {
  return enabled && (FILM_TRIAL_CLAIM_IDS as readonly string[]).includes(id);
}
