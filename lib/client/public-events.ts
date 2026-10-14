import type { PublicEvent } from "../domain/publication";
export const publicEventName = "plunode:public-event";
export function trackPublicEvent(event: PublicEvent) {
  window.dispatchEvent(new CustomEvent(publicEventName, { detail: event }));
}
