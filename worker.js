const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const COINBASE_SPOT = "https://api.coinbase.com/v2/prices/BTC-USD/spot";
const ETH_SPOT = "https://api.coinbase.com/v2/prices/ETH-USD/spot";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });
    try {
      let upstream;
      if (url.pathname === "/api/spot") {
        upstream = url.searchParams.get("asset") === "ETH" ? ETH_SPOT : COINBASE_SPOT;
      } else if (url.pathname.startsWith("/api/kalshi/")) {
        const path = url.pathname.slice("/api/kalshi/".length);
        if (!/^[a-zA-Z0-9_./%-]+$/.test(path) || path.includes("..")) {
          return Response.json({ error: "Invalid API path" }, { status: 400, headers: cors });
        }
        upstream = KALSHI_BASE + "/" + path + url.search;
      } else {
        return env.ASSETS.fetch(request);
      }
      const response = await fetch(upstream, {
        headers: { "Accept": "application/json", "User-Agent": "GRAPH-BTC15M/1.0" },
        cf: { cacheTtl: 0, cacheEverything: false }
      });
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: { ...cors, "Content-Type": response.headers.get("Content-Type") || "application/json" }
      });
    } catch (error) {
      return Response.json({ error: "Upstream data request failed", detail: String(error?.message || error) }, { status: 502, headers: cors });
    }
  }
};
