// =============================================================================
//  lib/stockApi.js  ※ サーバー専用（ブラウザから import しないこと）
//  Yahoo Finance の v8 chart エンドポイントから日本株の「現在値（実取引値）」を取得。
//  APIキー不要・User-Agentヘッダのみ。分割調整の遡及がかからない実際の値が得られる。
//
//  日本株（東証）は銘柄コードに .T を付ける（例: "8058" → "8058.T"）。
//
//  ※ Yahoo は公式の無料APIを提供しておらず、これは非公式エンドポイントの利用です。
//     個人利用の範囲で、過度な高頻度アクセスは避けてください。
//     無料データは取引所により約15〜20分遅延のことがありますが、価格の水準は正確です。
// =============================================================================

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  "Accept-Language": "ja,en;q=0.9",
  Referer: "https://finance.yahoo.com",
};

// 銘柄コード（例 "8058"）→ Yahooシンボル（東証 "8058.T"）
function toSymbol(code) {
  return `${String(code).trim()}.T`;
}

/**
 * 指定コードの現在値（取得できなければ前日終値）を返す。
 * @param {string} code 4桁コード（例 "8058"）
 * @returns {Promise<{close:number, date:string, currency:string}|null>}
 */
export async function fetchLatestClose(code) {
  const symbol = toSymbol(code);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1d`;

  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json = await res.json();
  if (json?.chart?.error) {
    throw new Error(`Yahoo: ${json.chart.error.description ?? "error"}`);
  }

  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return null;

  // 優先: 現在値 → 前日終値 → 終値配列の最後
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const lastClose = [...closes].reverse().find((v) => v != null);
  const price = meta.regularMarketPrice ?? meta.previousClose ?? lastClose ?? null;
  if (price == null) return null;

  const ts = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date();
  return {
    close: Number(price),
    date: ts.toISOString().slice(0, 10),
    currency: meta.currency ?? "JPY",
  };
}

/**
 * ローソク足チャート用の四本値を Lightweight Charts 形式で返す（分析画面の実データ化用）。
 * @param {string} code 4桁コード
 * @param {string} range "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" など
 */
export async function fetchDailyBars(code, range = "1y") {
  const symbol = toSymbol(code);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=${range}`;

  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp) return { bars: [], name: null };

  // Yahooのメタ情報から銘柄名（固定リストに無いコードでも名前を出すため）
  const meta = result.meta ?? {};
  const name = meta.shortName ?? meta.longName ?? null;

  const q = result.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((v) => v == null)) continue; // 欠損日はスキップ
    bars.push({
      time: new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10),
      open: o,
      high: h,
      low: l,
      close: c,
    });
  }
  return { bars, name };
}