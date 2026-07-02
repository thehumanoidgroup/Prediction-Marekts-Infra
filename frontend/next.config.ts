import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Minimal server bundle for the Docker runtime stage.
  output: "standalone",
};

export default nextConfig;
