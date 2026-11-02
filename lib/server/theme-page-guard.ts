import { notFound } from "next/navigation";
import { themeGuard } from "./theme-workbench";
/** Preview-only editing pages must not expose a broken form on the public beta. */
export function themePageGuard(){
 try { themeGuard(); } catch { notFound(); }
}
