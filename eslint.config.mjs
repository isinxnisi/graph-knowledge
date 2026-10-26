import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // Frozen prior-research executable: its exact bytes are evidence for 461cd1c, not current app source.
  globalIgnores(["docs/research/film-discovery-pilot-20261026/check-current.ts", ".next/**", ".next-public/**", ".next-pilot/**", ".next-pilot-v2/**", ".next-science/**", ".next-science-v2/**", ".next-event/**", ".next-event-contract-test/**", ".next-member-test/**", "next-env.d.ts", "coverage/**", "test-results/**", "playwright-report/**"]),
]);
