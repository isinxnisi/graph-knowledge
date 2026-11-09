/** Prefer a registered spelling suited to the UI script. This is presentation,
 * not a translation, an identity match, or a new authored name. */
type NamedEntity = { name: string; aliases?: readonly string[] };
const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const latinName = (s: string) => /\p{Script=Latin}/u.test(s) && !japanese.test(s) && !/^(?:https?:|Q\d+$|P\d+$|ISBN\b|[A-Z]+[-_:]\d)/i.test(s);
export function entityDisplayName(entity: NamedEntity | null | undefined, locale = "ja"): string {
  if (!entity) return "";
  const names = [entity.name, ...(entity.aliases ?? [])];
  if (locale.toLowerCase().startsWith("en")) return names.find(latinName) ?? entity.name;
  if (locale.toLowerCase().startsWith("ja")) return names.find(s => japanese.test(s)) ?? entity.name;
  return entity.name;
}
