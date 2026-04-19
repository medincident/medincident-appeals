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
}

export default nextConfig
