import type { NextConfig } from "next";

const config: NextConfig = { reactStrictMode: true,
  ...(process.env.GRAPH_DEPLOYMENT === "production" ? { output: "standalone" as const } : {}),
  // Multi-user fixture tests revisit many routes. Keep compiled entries for
  // their bounded run instead of repeatedly evicting and compiling them.
  ...(process.env.MEMBER_FIXTURE_ENABLED === "1" ? {
    onDemandEntries: { maxInactiveAge: 15 * 60_000, pagesBufferLength: 32 },
  } : {}),
  async headers() {
    return [{source:"/people/:handle",headers:[{key:"Cache-Control",value:"private, no-store"},{key:"Referrer-Policy",value:"no-referrer"},{key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"}]},{source:"/en/people/:handle",headers:[{key:"Cache-Control",value:"private, no-store"},{key:"Referrer-Policy",value:"no-referrer"},{key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"}]},{source:"/following",headers:[{key:"Cache-Control",value:"private, no-store"},{key:"Referrer-Policy",value:"no-referrer"},{key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"}]},{source:"/operations",headers:[{key:"Referrer-Policy",value:"no-referrer"},{key:"Cache-Control",value:"private, no-store"},{key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"}]},{source:"/communities",headers:[{key:"Referrer-Policy",value:"no-referrer"},{key:"Cache-Control",value:"private, no-store"}]}, { source: "/:path(api|member|shared|integrations|communities)/:rest*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }, { source: "/shared", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }];
  }, distDir: process.env.GRAPH_DATASET === "public-kg" ? ".next-public" : process.env.MEMBER_FIXTURE_ENABLED === "1" ? ".next-member-test" : process.env.GRAPH_CONTRACT_TEST === "1" ? ".next-event-contract-test" : process.env.GRAPH_DATASET === "pilot-event-v1" ? ".next-event" : process.env.GRAPH_DATASET === "pilot-science-v2" ? ".next-science-v2" : process.env.GRAPH_DATASET === "pilot-science-v1" ? ".next-science" : process.env.GRAPH_DATASET === "pilot-urasawa-v2" ? ".next-pilot-v2" : process.env.GRAPH_DATASET === "pilot-urasawa-v1" ? ".next-pilot" : ".next" };
export default config;
