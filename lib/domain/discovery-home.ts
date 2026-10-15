import type { ClaimSummary, EntitySummary } from "./api";

export type DiscoveryFeature = { entity: EntitySummary; nodes: EntitySummary[]; claims: ClaimSummary[] };
export type DiscoveryHomeData = {
  features: DiscoveryFeature[];
  recentEntities: { entity: EntitySummary; addedAt: string }[];
  recentClaims: { claim: ClaimSummary; subject: EntitySummary; object: EntitySummary; addedAt: string }[];
  counts: { entities: number; claims: number } | null;
  unavailable?: boolean;
};
