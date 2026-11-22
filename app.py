import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from kalshi_client import KalshiClient, KalshiAPIError
from analyzer import analyze_trend, format_price

st.set_page_config(page_title="GRAPH | Kalshi Market Analyzer", page_icon="📈", layout="wide")

st.markdown("""
<style>
.stApp {background: #090909; color: #f3f3f3;}
[data-testid="stSidebar"] {background: #111111;}
h1, h2, h3 {color: #ff4141 !important;}
div[data-testid="stMetric"] {background:#151515; border:1px solid #4b1717; padding:14px; border-radius:12px;}
.signal {padding:14px 18px; border-radius:12px; border:1px solid #702020; background:#170d0d;}
.small-muted {color:#a7a7a7; font-size:0.85rem;}
</style>
""", unsafe_allow_html=True)

st.title("📈 GRAPH")
st.caption("KALSHI MARKET ANALYZER · Public market data · Read-only")

with st.sidebar:
    st.header("Market settings")
    ticker = st.text_input("Kalshi market ticker", placeholder="Example: KX...").strip().upper()
    refresh_seconds = st.selectbox("Refresh interval", [5, 10, 15, 30], index=1)
    max_points = st.slider("Graph history points", 20, 300, 120, 10)
    st.divider()
    st.caption("Enter the exact market ticker shown on Kalshi. This app does not need your Kalshi password or API key.")

st.warning(
    "This tool analyzes the YES contract price direction. “Higher” means the YES price is moving up; "
    "“Lower” means it is moving down. It is not a prediction of the underlying event, and it cannot guarantee a profitable trade."
)

if "snapshots" not in st.session_state:
    st.session_state.snapshots = {}
if "last_ticker" not in st.session_state:
    st.session_state.last_ticker = ""

if ticker and ticker != st.session_state.last_ticker:
    st.session_state.snapshots[ticker] = []
    st.session_state.last_ticker = ticker

if not ticker:
    st.info("Enter a Kalshi market ticker in the sidebar to start the live graph.")
    st.markdown("### How to use")
    st.markdown("1. Open a market on Kalshi.\n2. Copy its market ticker.\n3. Paste the ticker in the sidebar.\n4. Leave this page open while the app collects price snapshots.")
    st.stop()

client = KalshiClient()


@st.fragment(run_every=f"{refresh_seconds}s")
def live_panel():
    try:
        market = client.get_market(ticker)
    except KalshiAPIError as exc:
        st.error(f"Could not load market: {exc}")
        return

    price = client.market_yes_price(market)
    if price is None:
        st.error("The market response did not contain a usable YES price.")
        with st.expander("Raw market fields"):
            st.json(market)
        return

    now = pd.Timestamp.now(tz="UTC")
    snapshots = st.session_state.snapshots.setdefault(ticker, [])
    snapshots.append({
        "time": now,
        "price_cents": price * 100,
        "volume_24h": _to_float(market.get("volume_24h_fp")),
        "last_price_cents": _to_float(market.get("last_price_dollars")) * 100
            if market.get("last_price_dollars") is not None else None,
    })
    snapshots[:] = snapshots[-max_points:]

    analysis = analyze_trend(snapshots)
    title = market.get("title") or market.get("subtitle") or ticker
    status = market.get("status", "unknown")

    st.subheader(title)
    st.caption(f"{ticker} · Status: {status} · Last refresh: {now.strftime('%H:%M:%S UTC')}")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("YES price", format_price(price), help="Midpoint of YES bid/ask when both are available; otherwise last traded price.")
    bid = _to_float(market.get("yes_bid_dollars"))
    ask = _to_float(market.get("yes_ask_dollars"))
    c2.metric("YES bid", format_price(bid) if bid is not None else "—")
    c3.metric("YES ask", format_price(ask) if ask is not None else "—")
    volume = _to_float(market.get("volume_24h_fp"))
    c4.metric("24h volume", f"{volume:,.0f}" if volume is not None else "—", help="Contracts, as reported by Kalshi.")

    signal_color = "#31c48d" if analysis["signal"] == "HIGHER" else "#ff6868" if analysis["signal"] == "LOWER" else "#e8c56a"
    st.markdown(
        f'<div class="signal"><span style="color:#aaa">DIRECTIONAL READ</span><br>'
        f'<span style="font-size:1.8rem;font-weight:700;color:{signal_color}">{analysis["signal"]}</span>'
        f'<br><span style="color:#ccc">{analysis["reason"]}</span></div>',
        unsafe_allow_html=True
    )

    left, right = st.columns(2)
    left.metric("Change since first snapshot", f'{analysis["change_cents"]:+.2f}¢' if analysis["change_cents"] is not None else "Collecting…")
    right.metric("Trend strength", analysis["strength"])

    df = pd.DataFrame(snapshots)
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df["time"], y=df["price_cents"], mode="lines+markers",
        name="YES price", line=dict(color="#ff4141", width=2),
        marker=dict(size=5), hovertemplate="%{x|%H:%M:%S}<br>%{y:.2f}¢<extra></extra>"
    ))
    fig.update_layout(
        template="plotly_dark", height=390, margin=dict(l=10, r=10, t=25, b=10),
        paper_bgcolor="#090909", plot_bgcolor="#101010",
        xaxis_title="Time (UTC)", yaxis_title="YES contract price (cents)",
        yaxis=dict(range=[0, 100], ticksuffix="¢", gridcolor="#292929"),
        xaxis=dict(gridcolor="#292929"), showlegend=False
    )
    st.plotly_chart(fig, use_container_width=True)

    with st.expander("Market details"):
        st.write({
            "Ticker": ticker,
            "Event ticker": market.get("event_ticker"),
            "Close time": market.get("close_time"),
            "Last traded price": market.get("last_price_dollars"),
            "Previous price": market.get("previous_price_dollars"),
            "Open interest (contracts)": market.get("open_interest_fp"),
            "Volume (contracts)": market.get("volume_fp"),
        })

    st.caption(
        f"Data points collected in this session: {len(snapshots)}. "
        f"Refreshes every {refresh_seconds} seconds while this page is open. "
        "The chart is a session-built snapshot history, not a full exchange historical feed."
    )


def _to_float(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


live_panel()

st.divider()
st.caption(
    "Educational analytics only. Market prices can move rapidly; the signal is a simple momentum heuristic, "
    "not a calibrated probability, financial advice, or a recommendation to trade. Consider spread, fees, "
    "liquidity, settlement rules, and the possibility of losing the full amount at risk."
)
