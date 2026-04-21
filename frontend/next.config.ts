import type { NextConfig } from "next"

const GRAFANA_URL = process.env.GRAFANA_URL ?? "http://grafana:3000"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // /metrics без слеша → Grafana ожидает subpath '/metrics/', добавляем его в destination.
      { source: "/metrics", destination: `${GRAFANA_URL}/metrics/` },
      { source: "/metrics/:path*", destination: `${GRAFANA_URL}/metrics/:path*` },
    ]
  },
  async headers() {
    return [
      {
        // SW обновляется на каждом деплое — отключаем кэш, иначе старая версия
        // зависает в браузере.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ]
  },
}

export default nextConfig
