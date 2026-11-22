# GRAPH — Bitcoin 15-minute market desk

A mobile-first installable web app for monitoring the active Kalshi Bitcoin 15-minute market. It looks up the active `KXBTC15M` event, selects the live contract nearest current BTC/USD spot, and displays YES bid/ask, midpoint, countdown, graph, EMA 9/21, RSI and a conservative HIGHER / LOWER / WAIT momentum read.

## Publish with GitHub Pages
1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. Open the **Actions** tab and check the `Deploy GRAPH to GitHub Pages` workflow.
4. When it succeeds, open **Settings → Pages** to find the published URL.

## Install on iPhone
Open the published URL in Safari → Share → Add to Home Screen.

## Data and limitations
- Uses Kalshi public Trade API v2 event/market endpoints and Binance public BTC/USDT spot ticker.
- The app calls public endpoints from the browser. If either service blocks browser CORS or changes its API, live data will show a visible error; a server-side proxy would then be required.
- The graph is built from snapshots collected while the app is open; it is not historical order-book data.
- EMA/RSI are calculated from observed YES midpoint snapshots. HIGHER/LOWER is a momentum heuristic, not a calibrated probability or settlement prediction.
- No trading, account access, API keys, or financial transactions.
