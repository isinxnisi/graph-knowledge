import type { CSSProperties } from "react";

const paths = {
  link: <><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  graph: <><path d="m6 7 11 2M6 8l4 10m7-8-6 8" /><circle cx="5" cy="6" r="3" /><circle cx="19" cy="9" r="3" /><circle cx="11" cy="20" r="2" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  book: <><path d="M12 5v15M3 4c4-1 6 0 9 1 3-1 5-2 9-1v15c-4-1-6 0-9 1-3-1-5-2-9-1Z" /></>,
  person: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2Z" /></>,
  organization: <><path d="M3 21h18M5 21V8l7-5 7 5v13M9 10h1m4 0h1m-6 4h1m4 0h1m-4 7v-4h2v4" /></>,
  event: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
  history: <><path d="M3 8V3m0 5h5M3 8a9 9 0 1 1 0 8M12 7v5l3 2" /></>,
  capsule: <><path d="m12 3 9 5v9l-9 5-9-5V8Zm0 0v19M3 8l9 5 9-5" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
  fit: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  focus: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
} as const;

// 意味は隣の文字／既存aria-labelが伝える。装飾アイコンは読み上げを重複させない。
export default function Icon({ name, style }: { name: keyof typeof paths; style?: CSSProperties }) {
  return <svg className="ui-icon" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
