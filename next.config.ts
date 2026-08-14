import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // 업로드 이미지 및 외부 도메인 허용
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },

  // 프로덕션 빌드에서 콘솔 로그 제거
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
};

export default nextConfig;
