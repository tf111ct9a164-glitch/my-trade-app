// =============================================================================
//  app/api/prices/route.js  【Yahoo→stooq フォールバック版】
//  現在値＋52週高安・出来高・当日騰落率をまとめて取得。
//
//  - GET /api/prices?codes=7203,6758,9984
//  - まず Yahoo（query1→query2）を試す。429 などで失敗したら stooq にフォールバック。
//    （Vercel の IP は Yahoo に 429 されやすいため、予備ソースで安定供給する）
//  - stooq は EOD・やや遅延・日本株は "コード.jp" 形式。新しい英数字コードは無いことがある。
//
//  返り値: { prices, names, metrics, errors, asOf }
//  ※ 取得失敗時は errors に理由（"Yahoo 429 / stooq: ..." など）が入る。
// =============================================================================

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const YH_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  "Accept-Language": "ja,en;q=0.9",
  Referer: "https://finance.yahoo.com",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

function normCode(v) {
  if (!v) return "";
  let s = String(v).trim().toUpperCase();
  if (s.endsWith(".T")) s = s.slice(0, -2);
  return s.replace(/\s+/g, "");
}

// 終値配列などから指標を組み立てる共通処理
function buildMetrics({ price, name, closes, highs, lows, volume }) {
  if (price == null) throw new Error("価格が取得できませんでした");

  const validCloses = closes.filter((v) => v != null && !isNaN(v));
  const prevClose = validCloses.length >= 2 ? validCloses[validCloses.length - 2] : null;
  const changePct = prevClose ? ((Number(price) - prevClose) / prevClose) * 100 : null;

  // 直近約1年（252営業日）の高安
  const win = (arr) => (arr.length > 252 ? arr.slice(-252) : arr);
  const vh = win(highs).filter((v) => v != null && !isNaN(v));
  const vl = win(lows).filter((v) => v != null && !isNaN(v));
  const week52High = vh.length ? Math.round(Math.max(...vh)) : null;
  const week52Low = vl.length ? Math.round(Math.min(...vl)) : null;

  return {
    price: Number(price),
    name: name || null,
    week52High,
    week52Low,
    volume: volume != null && !isNaN(volume) ? Number(volume) : null,
    changePct: changePct != null ? Number(changePct.toFixed(2)) : null,
  };
}

// ---- Yahoo ------------------------------------------------------------------
async function fetchFromYahoo(code) {
  const symbol = `${code}.T`;
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

  let lastErr;
  let json = null;
  for (const host of hosts) {
    try {
      const res = await fetch(host + path, { headers: YH_HEADERS, cache: "no-store" });
      if (!res.ok) { lastErr = new Error(`Yahoo ${res.status}`); continue; }
      json = await res.json();
      break;
    } catch (e) { lastErr = e; }
  }
  if (!json) throw lastErr ?? new Error("Yahoo fetch failed");

  const result = json?.chart?.result?.[0];
  if (!result) {
    const desc = json?.chart?.error?.description;
    throw new Error(desc ? `Yahoo: ${desc}` : "Yahoo: データなし");
  }
  const meta = result.meta;
  const q = result.indicators?.quote?.[0] ?? {};
  const closes = q.close ?? [];

  let price = meta?.regularMarketPrice;
  if (price == null) {
    for (let i = closes.length - 1; i >= 0; i--) if (closes[i] != null) { price = closes[i]; break; }
  }
  let volume = null;
  const vols = q.volume ?? [];
  for (let i = vols.length - 1; i >= 0; i--) if (vols[i] != null) { volume = vols[i]; break; }

  return buildMetrics({
    price,
    name: meta?.shortName || meta?.longName || null,
    closes,
    highs: q.high ?? [],
    lows: q.low ?? [],
    volume,
  });
}

// ---- stooq（フォールバック）-------------------------------------------------
async function fetchFromStooq(code) {
  const d2 = new Date();
  const d1 = new Date(); d1.setDate(d1.getDate() - 400);
  const sym = `${code.toLowerCase()}.jp`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&d1=${ymd(d1)}&d2=${ymd(d2)}&i=d`;

  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`stooq ${res.status}`);
  const text = await res.text();

  const lines = text.trim().split("\n");
  if (lines.length < 2 || !/^date/i.test(lines[0])) throw new Error("stooq: データなし");

  // Date,Open,High,Low,Close,Volume（昇順）
  const rows = lines.slice(1)
    .map((l) => l.split(","))
    .filter((c) => c.length >= 6 && c[4] !== "" && c[4] !== "N/D");
  if (rows.length === 0) throw new Error("stooq: データなし");

  const closes = rows.map((c) => Number(c[4]));
  const highs = rows.map((c) => Number(c[2]));
  const lows = rows.map((c) => Number(c[3]));
  const last = rows[rows.length - 1];

  return buildMetrics({
    price: Number(last[4]),
    name: null,
    closes,
    highs,
    lows,
    volume: Number(last[5]),
  });
}

// ---- Yahoo → stooq の順で取得 -----------------------------------------------
async function fetchOne(code) {
  try {
    return await fetchFromYahoo(code);
  } catch (yErr) {
    try {
      return await fetchFromStooq(code);
    } catch (sErr) {
      throw new Error(`${yErr.message} / stooq: ${sErr.message}`);
    }
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("codes") || searchParams.get("code") || "";
  const codes = [...new Set(raw.split(",").map(normCode).filter(Boolean))];

  if (codes.length === 0) {
    return Response.json({ error: "codes が指定されていません" }, { status: 400 });
  }

  const prices = {};
  const names = {};
  const metrics = {};
  const errors = {};

  // 1 件ずつ順番に（429 回避）。間に小休止。
  for (const code of codes) {
    try {
      const r = await fetchOne(code);
      prices[code] = r.price;
      if (r.name) names[code] = r.name;
      metrics[code] = {
        week52High: r.week52High,
        week52Low: r.week52Low,
        volume: r.volume,
        changePct: r.changePct,
      };
    } catch (e) {
      errors[code] = String(e.message ?? e);
    }
    await sleep(200);
  }

  return Response.json({ prices, names, metrics, errors, asOf: new Date().toISOString() });
}