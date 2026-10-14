// Only a public exploration URL is retained in this tab; no identity or Capsule content.
const returnKey = "graph-knowledge:account-return:v1";
export const memberSessionEvent = "graph-knowledge:member-session-changed";
function safeExplorationHref(value: string) {
  const url = new URL(value, location.origin);
  if (url.origin !== location.origin || !/^\/(?:explore\/[0-9a-f-]{36})?$/.test(url.pathname)) return "/";
  if ([...url.searchParams.keys()].some(key => key !== "s") || url.hash) return "/";
  return url.pathname + url.search;
}
export function rememberExplorationReturn() {
  try { sessionStorage.setItem(returnKey, safeExplorationHref(location.href)); } catch { /* Browser Back still has the exploration URL. */ }
}
export function explorationReturnHref() {
  try { return safeExplorationHref(sessionStorage.getItem(returnKey) ?? "/"); } catch { return "/"; }
}
export function notifyMemberSessionChange() {
  window.dispatchEvent(new Event(memberSessionEvent));
  try { localStorage.setItem(memberSessionEvent, crypto.randomUUID()); } catch { /* Focus/visibility also reauthorizes. */ }
}
