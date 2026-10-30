import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  
  allowedDevOrigins: ["192.168.8.176", "0.0.0.0"],
  
  
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: "http://127.0.0.1:8000/:path*",
      },
    ];
  },
};

export default nextConfig;