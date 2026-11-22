# GRAPH — Bitcoin 15-minute market desk

Mobile-first installable web app for the active Kalshi BTC 15-minute market.

## Deploy on Cloudflare
This repo is configured for Cloudflare Workers Static Assets. In the Cloudflare Pages/Workers Git integration, use:
- Build command: leave blank
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

The Worker proxies public market-data requests server-side:
- `/api/kalshi/*` → Kalshi Trade API v2
- `/api/spot` → Coinbase BTC/USD spot endpoint

No API keys are needed for these public read-only endpoints. The browser calls same-origin URLs, avoiding the browser-to-third-party CORS failure. The proxy only allows GET requests and fixed upstream hosts.

## Install on iPhone
Open the deployed URL in Safari → Share → Add to Home Screen.

## Notes
- Automatically searches open `KXBTC15M` markets and picks the next contract by close time.
- YES midpoint snapshots build the live session graph; EMA 9/21 and RSI are based on those observations.
- HIGHER / LOWER are simple momentum heuristics, not probabilities or settlement predictions. If market data is unavailable or insufficient, the signal stays WAIT.
- No trading, account access, API keys, or financial transactions.


Cloudflare deployment trigger: this repository is connected to Workers Builds.
