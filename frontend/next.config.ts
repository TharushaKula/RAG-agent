import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["hnswlib-node"], // Exclude native modules from bundling
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*", // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
