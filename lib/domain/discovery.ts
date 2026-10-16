import type { Predicate } from "./predicates";
// Editorial starting points, not classifications asserted about every member.
export const DISCOVERY_THEMES = ["manga", "science", "events"] as const;
export type DiscoveryTheme = typeof DISCOVERY_THEMES[number];
export const DISCOVERY_SEEDS: Record<DiscoveryTheme, readonly string[]> = {
  manga: ["2b7c6289-d050-4dc0-93e3-9307681253cc", "d900543a-9c11-48c1-be76-1822b756fcc4", "29e9caea-6c44-4c1f-9abc-f4350003ca3b"],
  science: ["8e322435-4318-4ad0-835b-3f71d2537421", "5cda395a-4927-4cae-92fe-839b29d05095", "1530af15-129d-40bf-a1ca-ce8343dc7491"],
  events: ["247d3efb-6172-4a3e-aa09-dad69914b47c", "32f5aa9e-1d60-40c9-9ba0-ce12f72cf524"],
};
export type DiscoveryFacet = { predicate: Predicate; count: number };
