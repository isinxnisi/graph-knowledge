import type { ReactNode } from "react";

// Framework shell only. Pages and API routes are intentionally deferred.
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>;
}
