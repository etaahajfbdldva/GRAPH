from typing import Any, Dict, Optional
import requests


class KalshiAPIError(RuntimeError):
    """Raised when Kalshi's public market-data API cannot provide a response."""


class KalshiClient:
    BASE_URL = "https://external-api.kalshi.com/trade-api/v2"

    def __init__(self, timeout: int = 12):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json",
            "User-Agent": "GRAPH-Kalshi-Market-Analyzer/1.0",
        })

    def get_market(self, ticker: str) -> Dict[str, Any]:
        if not ticker or len(ticker) > 120:
            raise KalshiAPIError("Enter a valid market ticker.")
        url = f"{self.BASE_URL}/markets/{ticker}"
        try:
            response = self.session.get(url, timeout=self.timeout)
        except requests.RequestException as exc:
            raise KalshiAPIError(f"Network error: {exc}") from exc

        if response.status_code == 404:
            raise KalshiAPIError("Ticker not found. Check the exact market ticker.")
        if response.status_code == 429:
            raise KalshiAPIError("Kalshi rate limit reached. Increase the refresh interval and try again.")
        if not response.ok:
            raise KalshiAPIError(f"Kalshi API returned HTTP {response.status_code}: {response.text[:250]}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise KalshiAPIError("Kalshi returned an unreadable response.") from exc

        market = payload.get("market", payload)
        if not isinstance(market, dict):
            raise KalshiAPIError("Unexpected market response format.")
        return market

    @staticmethod
    def market_yes_price(market: Dict[str, Any]) -> Optional[float]:
        """Return a YES price in dollars, preferring bid/ask midpoint."""
        bid = _number(market.get("yes_bid_dollars"))
        ask = _number(market.get("yes_ask_dollars"))
        if bid is not None and ask is not None and 0 <= bid <= 1 and 0 <= ask <= 1 and ask >= bid:
            return (bid + ask) / 2

        last = _number(market.get("last_price_dollars"))
        if last is not None and 0 <= last <= 1:
            return last

        previous = _number(market.get("previous_price_dollars"))
        if previous is not None and 0 <= previous <= 1:
            return previous
        return None


def _number(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None
