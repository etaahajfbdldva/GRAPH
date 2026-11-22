const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const COINBASE_SPOT = "https://api.coinbase.com/v2/prices/BTC-USD/spot";
const ETH_SPOT = "https://api.coinbase.com/v2/prices/ETH-USD/spot";


function pemBytes(pem) {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s/g, "");
  const raw = atob(body);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function kalshiAuth(env, method, apiPath) {
  const keyId = env.KALSHI_API_KEY_ID;
  const pem = env.KALSHI_PRIVATE_KEY;
  if (!keyId || !pem) throw new Error("Kalshi API secrets are not configured in Cloudflare.");
  const timestamp = String(Date.now());
  const path = apiPath.split("?")[0];
  const message = new TextEncoder().encode(timestamp + method.toUpperCase() + path);
  const der = pemBytes(pem);
  let key, signature;
  try {
    key = await crypto.subtle.importKey("pkcs8", der, { name: "RSA-PSS", hash: "SHA-256" }, false, ["sign"]);
    signature = await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 32 }, key, message);
  } catch (rsaError) {
    try {
      key = await crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
      signature = await crypto.subtle.sign({ name: "Ed25519" }, key, message);
    } catch (edError) {
      throw new Error("Could not read the Kalshi private key. Use the original PEM private key from your Kalshi API key.");
    }
  }
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return {
    "KALSHI-ACCESS-KEY": keyId,
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
    "KALSHI-ACCESS-SIGNATURE": btoa(binary),
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
}

function kalshiTradeBase(env) {
  return env.KALSHI_ENV === "production"
    ? "https://api.elections.kalshi.com/trade-api/v2"
    : "https://demo-api.kalshi.co/trade-api/v2";
}

async function privateKalshiFetch(env, method, path, body) {
  const headers = await kalshiAuth(env, method, "/trade-api/v2" + path);
  const response = await fetch(kalshiTradeBase(env) + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { error: raw.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(data.message || data.error || ("Kalshi returned HTTP " + response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}

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
      if (url.pathname === "/api/account/test" && request.method === "GET") {
        const data = await privateKalshiFetch(env, "GET", "/portfolio/balance");
        return Response.json({ connected: true, environment: env.KALSHI_ENV === "production" ? "production" : "demo", balance: data.balance ?? null, portfolio: data }, { headers: cors });
      } else if (url.pathname === "/api/account/balance" && request.method === "GET") {
        const data = await privateKalshiFetch(env, "GET", "/portfolio/balance");
        return Response.json(data, { headers: cors });
      } else if (url.pathname === "/api/spot") {
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
