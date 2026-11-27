const WATCHLIST = ["SPY","QQQ","DIA","IWM","AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AMD","JPM","XLF","XLK","GLD"];
const BUDGET = 100, RISK = 1.5, MAX_POSITION = 35;
export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/scan") return json(await scan(), 200, request);
  if (url.pathname === "/api/health") return json({ok:true,app:"GRAPH SWING TRADER",budget:BUDGET},200,request);
  if (url.pathname === "/") return env.ASSETS ? env.ASSETS.fetch(request) : new Response("GRAPH SWING TRADER assets binding missing",{status:503});
  return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found",{status:404});
 },
 async scheduled(event, env, ctx) { ctx.waitUntil(scan().then(async data => { if(env.SCAN_CACHE) await env.SCAN_CACHE.put("latest",JSON.stringify(data),{expirationTtl:86400}); })); }
};
function json(data,status=200,request){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":new URL(request.url).origin}})}
async function scan(){
 const results = await Promise.all(WATCHLIST.map(async symbol => {
  try { const r=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+symbol+"?range=6mo&interval=1d",{headers:{"User-Agent":"Mozilla/5.0 GRAPH-Swing-Trader"}}); if(!r.ok)return null; const j=await r.json(), q=j.chart?.result?.[0]; if(!q)return null;
   const closes=(q.indicators?.quote?.[0]?.close||[]).filter(Number.isFinite), highs=(q.indicators?.quote?.[0]?.high||[]), lows=(q.indicators?.quote?.[0]?.low||[]);
   if(closes.length<55)return null;
   const last=closes.at(-1),sma20=avg(closes.slice(-20)),sma50=avg(closes.slice(-50)),prev20=avg(closes.slice(-25,-5)),rsi=calcRsi(closes,14),atr=calcAtr(highs,lows,closes,14);
   const momentum=sma20-prev20, trend=last>sma20&&sma20>sma50, strength=rsi>=52&&rsi<=68&&momentum>0;
   const entry=last,stop=last-2*atr,target=last+3*atr,perShare=entry-stop;
   const shares=Math.max(0,Math.min(RISK/perShare,MAX_POSITION/entry));
   const dollars=shares*entry;
   let action="WAIT",reason="Trend or momentum confirmation is missing.";
   if(trend&&strength&&rsi<70&&atr>0&&dollars>=1){action="BUY";reason="Price is above rising 20-day and 50-day averages, with positive 20-day momentum and RSI confirmation. Consider only if the live quote remains near the entry range."}
   else if(last<sma50&&sma20<sma50){action="SELL";reason="Daily trend is below the 50-day average and the 20-day average is below the 50-day average. If you own it, review your exit plan."}
   const targetGain=target-entry,rr=perShare>0?targetGain/perShare:0;
   return {symbol,name:q.meta?.longName||q.meta?.shortName||symbol,action,price:last,dollars:action==="BUY"?dollars:0,shares:action==="BUY"?shares:0,entryLow:entry-0.25*atr,entryHigh:entry+0.25*atr,stop,target,hold:"2–10 trading days",rsi:Number(rsi.toFixed(1)),risk:RISK,rewardRisk:Number(rr.toFixed(2)),reason};
  } catch(e){return null}
 }));
 return {generatedAt:new Date().toISOString(),budget:BUDGET,maxRiskPerTrade:RISK,maxPosition:MAX_POSITION,results:results.filter(Boolean).filter(x=>x.action!=="WAIT").sort((a,b)=>b.rewardRisk-a.rewardRisk)};
}
function avg(a){return a.reduce((s,x)=>s+x,0)/a.length}
function calcRsi(c,p){let g=0,l=0;for(let i=c.length-p;i<c.length;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}if(!l)return 100;return 100-100/(1+g/l)}
function calcAtr(h,l,c,p){let sum=0,n=0;for(let i=c.length-p;i<c.length;i++){if(!Number.isFinite(h[i])||!Number.isFinite(l[i]))continue;sum+=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));n++}return n?sum/n:0}
