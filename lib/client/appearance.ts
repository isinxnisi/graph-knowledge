export const appearanceKey = "graph-knowledge:appearance:v1";
export type Appearance = { theme: "light" | "dark-brown" | "dark-blue"; palette: "brown" | "blue" };
export const defaultAppearance: Appearance = { theme: "light", palette: "brown" };

export function readAppearance(raw: string | null): Appearance {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !["light", "dark-brown", "dark-blue"].includes(value.theme) || !["brown", "blue"].includes(value.palette)) return defaultAppearance;
    return { theme: value.theme, palette: value.theme === "dark-blue" ? "blue" : value.theme === "dark-brown" ? "brown" : value.palette };
  } catch { return defaultAppearance; }
}
