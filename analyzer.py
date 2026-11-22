from typing import Dict, List, Optional


def analyze_trend(snapshots: List[Dict]) -> Dict:
    """
    Simple, transparent momentum heuristic.
    It does not estimate the true probability of an event or predict settlement.
    """
    values = [float(row["price_cents"]) for row in snapshots if row.get("price_cents") is not None]
    if len(values) < 4:
        return {
            "signal": "NO CLEAR SIGNAL",
            "reason": f"Collecting baseline data: {len(values)}/4 snapshots.",
            "change_cents": None,
            "strength": "Insufficient data",
        }

    change = values[-1] - values[0]
    recent = values[-4:]
    recent_change = recent[-1] - recent[0]
    threshold = 0.5

    if change >= threshold and recent_change > 0:
        signal = "HIGHER"
        reason = "YES price is above the first observation and the latest short-term movement is upward."
    elif change <= -threshold and recent_change < 0:
        signal = "LOWER"
        reason = "YES price is below the first observation and the latest short-term movement is downward."
    else:
        signal = "NO CLEAR SIGNAL"
        reason = "Price movement is small, mixed, or not consistently directional."

    magnitude = abs(change)
    if len(values) < 8:
        strength = "Early read"
    elif magnitude >= 3 and abs(recent_change) >= 1:
        strength = "Stronger movement (not a probability)"
    elif magnitude >= threshold:
        strength = "Moderate movement (not a probability)"
    else:
        strength = "Weak / mixed"

    return {
        "signal": signal,
        "reason": reason,
        "change_cents": change,
        "strength": strength,
    }


def format_price(dollars: Optional[float]) -> str:
    if dollars is None:
        return "—"
    return f"{dollars * 100:.1f}¢"
