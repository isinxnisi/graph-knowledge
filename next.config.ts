import type { NextConfig } from "next";

const config: NextConfig = { reactStrictMode: true, distDir: process.env.GRAPH_CONTRACT_TEST === "1" ? ".next-event-contract-test" : process.env.GRAPH_DATASET === "pilot-event-v1" ? ".next-event" : process.env.GRAPH_DATASET === "pilot-science-v2" ? ".next-science-v2" : process.env.GRAPH_DATASET === "pilot-science-v1" ? ".next-science" : process.env.GRAPH_DATASET === "pilot-urasawa-v2" ? ".next-pilot-v2" : process.env.GRAPH_DATASET === "pilot-urasawa-v1" ? ".next-pilot" : ".next" };
export default config;
