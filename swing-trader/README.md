# GRAPH SWING TRADER

A separate Cloudflare Worker app for daily U.S. stock/ETF research signals. It does not modify the existing GRAPH Kalshi app and never places orders.

## Starter risk settings
- Paper planning budget: $100
- Maximum planned loss per position: $1.50 (1.5% of budget)
- Maximum position size: $35
- Watchlist: liquid broad-market ETFs and large-cap U.S. stocks
- Expected holding window: 2–10 trading days

## Deploy
1. Create a NEW Cloudflare Worker named `graph-swing-trader` (do not change the existing `graph` worker).
2. Deploy `worker.js` as the Worker entry point.
3. Configure a static assets directory containing `index.html`, `manifest.webmanifest`, and `sw.js`; bind it to the Worker as `ASSETS` (Workers Static Assets).
4. Optional: bind a KV namespace as `SCAN_CACHE` for scheduled scan caching.
5. Add a Cron Trigger such as `0 14 * * 1-5` (UTC) for a weekday scan. The current scheduled handler caches results only; it does not send push notifications.
6. Test `/api/health` and `/api/scan`.

## Important limitations
- Yahoo Finance chart data is an unofficial source and may be delayed, rate-limited, or unavailable.
- Signals are a simple technical screen, not a forecast or guarantee.
- No brokerage integration, trade execution, persistent position tracking, or push notification delivery is implemented yet.
- Do not use real money until you independently verify prices, order sizing, fees, stop orders, and the strategy.
