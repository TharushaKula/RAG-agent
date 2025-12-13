import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["hnswlib-node"], // Exclude native modules from bundling
};

export default nextConfig;
