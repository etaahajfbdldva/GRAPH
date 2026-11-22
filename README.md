# GRAPH — Kalshi Market Analyzer

A read-only Streamlit dashboard that polls Kalshi's public market endpoint, charts the YES contract price, and labels short-term momentum as HIGHER, LOWER, or NO CLEAR SIGNAL.

## Important limitations

- The signal describes movement in the **YES contract price**, not whether the real-world event itself will happen.
- It is a simple momentum heuristic, not a calibrated probability or a prediction of settlement.
- The chart collects snapshots while this app is open. It does not reconstruct older price history.
- It does not place trades, connect to your portfolio, or need your Kalshi password/API key.
- Prices can move quickly. Spread, fees, liquidity, market rules, and the possibility of losing the full amount at risk matter.

## Requirements

- Python 3.10+
- Internet connection
- A Kalshi market ticker

## Setup

```bash
python -m venv .venv
```

Activate it:

**Windows PowerShell**
```powershell
.venv\Scripts\Activate.ps1
```

**macOS / Linux**
```bash
source .venv/bin/activate
```

Install packages and run:

```bash
pip install -r requirements.txt
streamlit run app.py
```

Streamlit opens the dashboard in your browser. Paste the exact market ticker into the sidebar.

## Tests

```bash
python -m unittest discover -s tests -v
```

## Architecture

- `app.py`: Streamlit interface, refresh loop, chart and metrics
- `kalshi_client.py`: Read-only HTTP client and market price normalization
- `analyzer.py`: Transparent momentum heuristic and formatting helpers
- `tests/`: Unit tests for signal classification

## Data source

Kalshi public Trade API v2:
`https://external-api.kalshi.com/trade-api/v2/markets/{ticker}`

The app reads market metadata and public price fields. It does not use authenticated account endpoints.
