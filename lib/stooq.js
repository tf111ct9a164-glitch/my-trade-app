// =============================================================================
//  lib/stooq.js  ※ サーバー専用（ブラウザから import しないこと）
//  Stooq の日次CSVから「最新の終値」を取得する。APIキー不要。
//
//  CSV形式（先頭行）: Date,Open,High,Low,Close,Volume
//   例) https://stooq.com/q/d/l/?s=7203.jp&i=d
//
//  ※ Stooqは公式APIではなくEOD（終値）データです。日本株は4桁コードに .jp を付けます。
//     リクエストし過ぎると一時的にブロックされCSV以外が返ることがあるため、その検知も行う。
// =============================================================================

const UA = "Mozilla/5.0 (compatible; trade-app/1.0)";

// 銘柄コード（例 "7203"）→ Stooqシンボル（例 "7203.jp"）
function toSymbol(code) {
  return `${String(code).trim().toLowerCase()}.jp`;
}

// CSVテキストを {date, open, high, low, close} の配列へ（昇順）
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || !/^date,/i.test(lines[0])) {
    // ヘッダが無い＝CSVでない（レート制限・銘柄なし等）
    return null;
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 5) continue;
    const date = c[0];
    const close = parseFloat(c[4]);
    if (!date || Number.isNaN(close)) continue;
    rows.push({
      date,
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close,
    });
  }
  // 日付昇順（StooqはCSVの並びが変わることがあるので明示的にソート）
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}

/**
 * 指定コードの最新終値を返す。
 * @param {string} code 4桁コード（例 "7203"）
 * @returns {Promise<{close:number, date:string}|null>}
 */
export async function fetchLatestClose(code) {
  const url = `https://stooq.com/q/d/l/?s=${toSymbol(code)}&i=d`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);

  const rows = parseCsv(await res.text());
  if (rows === null) throw new Error("StooqからCSVが返りませんでした（レート制限の可能性）");
  if (rows.length === 0) return null;

  const last = rows[rows.length - 1];
  return { close: last.close, date: last.date };
}

/**
 * ローソク足チャート用の四本値を Lightweight Charts 形式で返す（分析画面の実データ化用）。
 * @returns {Promise<Array<{time:string,open:number,high:number,low:number,close:number}>>}
 */
export async function fetchDailyBars(code) {
  const url = `https://stooq.com/q/d/l/?s=${toSymbol(code)}&i=d`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);

  const rows = parseCsv(await res.text());
  if (!rows) return [];
  return rows.map((r) => ({
    time: r.date, // "YYYY-MM-DD"
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
  }));
}