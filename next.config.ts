import type { NextConfig } from "next";

const config: NextConfig = { reactStrictMode: true, distDir: process.env.GRAPH_DATASET === "pilot-urasawa-v1" ? ".next-pilot" : ".next" };
export default config;
