const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const COINBASE_SPOT = "https://api.coinbase.com/v2/prices/BTC-USD/spot";
const ETH_SPOT = "https://api.coinbase.com/v2/prices/ETH-USD/spot";


function pemBytes(pem) {
  // Accept real PEM line breaks or literal \n sequences from a pasted secret.
  let normalized = String(pem).replace(/^\uFEFF/, "").trim();
  normalized = normalized.replace(/^["']|["']$/g, "").replace(/\\r\\n|\\n|\\r/g, "\n");
  const body = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/[\t\n\r ]/g, "");
  if (!body || !/^[A-Za-z0-9+/]*={0,2}$/.test(body) || body.length % 4 === 1) {
    throw new Error("Private key format is invalid. Paste the complete original PEM key, including its BEGIN and END lines.");
  }
  const base64 = body.padEnd(Math.ceil(body.length / 4) * 4, "=");
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function kalshiAuth(env, method, apiPath) {
  // Keep demo and production credentials separate. Demo is the safe default.
  const production = env.KALSHI_ENV === "production";
  const keyId = production ? env.KALSHI_API_KEY_ID : env.KALSHI_DEMO_API_KEY_ID;
  const pem = production ? env.KALSHI_PRIVATE_KEY : env.KALSHI_DEMO_PRIVATE_KEY;
  if (!keyId || !pem) {
    throw new Error(production
      ? "Production Kalshi API secrets are not configured in Cloudflare."
      : "Demo Kalshi API secrets are not configured. Add KALSHI_DEMO_API_KEY_ID and KALSHI_DEMO_PRIVATE_KEY in Cloudflare.");
  }
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
    const detail = typeof data.message === "string" ? data.message
      : typeof data.error === "string" ? data.error
      : JSON.stringify(data);
    const error = new Error("Kalshi HTTP " + response.status + ": " + (detail || raw.slice(0, 400)));
    error.status = response.status;
    throw error;
  }
  return data;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET" && request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
    if (url.pathname === "/api/position" && request.method === "GET") {
      try {
        const ticker = String(url.searchParams.get("ticker") || "");
        if (!/^[A-Z0-9._-]{3,80}$/.test(ticker)) return Response.json({error:"Invalid ticker"},{status:400,headers:cors});
        const [positions, marketData] = await Promise.all([
          privateKalshiFetch(env,"GET","/portfolio/positions?ticker="+encodeURIComponent(ticker)+"&count_filter=position"),
          privateKalshiFetch(env,"GET","/markets/"+encodeURIComponent(ticker))
        ]);
        const p=(positions.market_positions||[]).find(x=>x.ticker===ticker);
        const qty=Number(p?.position_fp ?? p?.position ?? 0);
        if (!p || !Number.isFinite(qty) || qty===0) return Response.json({position:null},{headers:cors});
        const m=marketData.market||{};
        const exitPrice=qty>0?Number(m.yes_bid_dollars ?? (m.yes_bid!=null?m.yes_bid/100:NaN)):Number(m.no_bid_dollars ?? (m.no_bid!=null?m.no_bid/100:NaN));
        const contracts=Math.abs(qty), basis=Number(p.market_exposure_dollars ?? (Number(p.market_exposure||0)/100));
        const fees=Number(p.fees_paid_dollars ?? (Number(p.fees_paid||0)/100));
        if (!Number.isFinite(exitPrice) || exitPrice<=0 || exitPrice>=1 || !Number.isFinite(basis)) {
          return Response.json({error:"A reliable exit bid or position cost basis is not available yet."},{status:409,headers:cors});
        }
        const estimatedValue=contracts*exitPrice;
        const estimatedNet=estimatedValue-basis-fees;
        const denominator=basis+fees;
        return Response.json({position:{
          ticker,side:qty>0?"YES":"NO",contracts,exit_bid_dollars:exitPrice,
          cost_basis_dollars:basis+fees,estimated_exit_value_dollars:estimatedValue,
          estimated_net_pnl_dollars:estimatedNet,
          estimated_profit_percent:denominator>0?estimatedNet/denominator*100:0,
          note:"Estimate uses the current bid and recorded fees; actual fills, fees and slippage may differ."
        }},{headers:cors});
      } catch(error) {
        return Response.json({error:error.message||"Position lookup failed"},{status:error.status||502,headers:cors});
      }
    }
    if (url.pathname === "/api/close-position" && request.method === "POST") {
      try {
        const input=await request.json(),ticker=String(input.ticker||"");
        if (!/^[A-Z0-9._-]{3,80}$/.test(ticker)) return Response.json({error:"Invalid ticker"},{status:400,headers:cors});
        const [positions,marketData]=await Promise.all([
          privateKalshiFetch(env,"GET","/portfolio/positions?ticker="+encodeURIComponent(ticker)+"&count_filter=position"),
          privateKalshiFetch(env,"GET","/markets/"+encodeURIComponent(ticker))
        ]);
        const p=(positions.market_positions||[]).find(x=>x.ticker===ticker);
        const qty=Number(p?.position_fp ?? p?.position ?? 0);
        if (!Number.isFinite(qty)||qty===0) return Response.json({error:"No open position to close."},{status:409,headers:cors});
        const m=marketData.market||{},yesSide=qty>0;
        const price=yesSide?Number(m.yes_bid_dollars ?? (m.yes_bid!=null?m.yes_bid/100:NaN)):1-Number(m.no_bid_dollars ?? (m.no_bid!=null?m.no_bid/100:NaN));
        const status=String(m.status||"").toLowerCase();
        if (!["open","active"].includes(status)) return Response.json({error:"Market is not open for trading."},{status:409,headers:cors});
        if (!Number.isFinite(price)||price<=0||price>=1) return Response.json({error:"No valid executable bid is available to close this position."},{status:409,headers:cors});
        const order=await privateKalshiFetch(env,"POST","/portfolio/events/orders",{
          ticker,side:yesSide?"ask":"bid",count:Math.abs(qty).toFixed(2),price:price.toFixed(4),
          time_in_force:"immediate_or_cancel",self_trade_prevention_type:"taker_at_cross",
          reduce_only:true,client_order_id:crypto.randomUUID()
        });
        return Response.json({submitted:true,order,reduce_only:true},{headers:cors});
      } catch(error) {
        return Response.json({error:error.message||"Cash-out submission failed"},{status:error.status||502,headers:cors});
      }
    }
    if (url.pathname === "/api/orders" && request.method === "POST") {
      try {
        const input = await request.json();
        const ticker = String(input.ticker || "");
        const side = String(input.side || "").toLowerCase();
        const count = Number(input.count);
        const priceCents = Number(input.price_cents);
        if (!/^[A-Z0-9._-]{3,80}$/.test(ticker) || !["yes", "no"].includes(side) ||
            !Number.isInteger(count) || count < 1 || count > 10 ||
            !Number.isInteger(priceCents) || priceCents < 1 || priceCents > 99) {
          return Response.json({ error: "Invalid order. Quantity must be 1–10 and limit price 1–99 cents." }, { status: 400, headers: cors });
        }
        // Verify the selected market is still open before accepting an order.
        const marketData = await privateKalshiFetch(env, "GET", "/markets/" + encodeURIComponent(ticker));
        const status = String(marketData.market?.status || "").toLowerCase();
        if (status && !["open", "active"].includes(status)) {
          return Response.json({ error: "This market is no longer open. Refresh GRAPH PRO before ordering." }, { status: 409, headers: cors });
        }
        // V2 uses the YES book: bid buys YES; ask buys NO at its complementary YES price.
        const yesBookPrice = side === "yes" ? priceCents / 100 : 1 - priceCents / 100;
        const order = await privateKalshiFetch(env, "POST", "/portfolio/events/orders", {
          ticker,
          side: side === "yes" ? "bid" : "ask",
          count: String(count),
          price: yesBookPrice.toFixed(4),
          time_in_force: "immediate_or_cancel",
          self_trade_prevention_type: "taker_at_cross",
          client_order_id: crypto.randomUUID()
        });
        return Response.json({ submitted: true, order }, { headers: cors });
      } catch (error) {
        return Response.json({ error: error.message || "Order submission failed" }, { status: error.status || 502, headers: cors });
      }
    }
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
      const detail = error && typeof error.message === "string" ? error.message
        : error && typeof error === "object" ? JSON.stringify(error)
        : String(error);
      return Response.json({ error: "Upstream data request failed", detail }, { status: 502, headers: cors });
    }
  }
};
