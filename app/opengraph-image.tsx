import { shareImage } from "../lib/server/share-image";
export const alt = "Plunode — 知識のつながりを探索する";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() { return shareImage("ja"); }
