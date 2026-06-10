// =============================================================================
//  lib/portfolio.js
//  取引履歴(trades)と最新株価(stock_prices)から保有状況を集計するロジック。
//
//  - computePortfolio(trades, prices) : 純粋関数（テストしやすい・UIに依存しない）
//  - loadPortfolio()                  : Supabase から取得して集計まで行うラッパー
//
//  平均取得単価は「移動平均法」で算出する。
//  取引を日付順に処理し、買いで平均を更新、売りでは平均を変えずに実現損益を加算、
//  保有株数が0になったら原価・平均をリセットする（＝全売却で建玉クリア）。
// =============================================================================

import { supabase } from "@/lib/supabase";

// side の値が 'buy'/'sell' でも '買い'/'売り' でも正しく判定できるようにする
const isBuy = (side) => {
  const s = String(side ?? "").trim().toLowerCase();
  return s === "buy" || s.includes("買");
};

/**
 * @param {Array} trades  trades テーブルの全行
 * @param {Array} prices  stock_prices テーブルの全行（PKは ticker、name 列なし）
 */
export function computePortfolio(trades = [], prices = []) {
  // 銘柄コード → 最新株価情報 の参照表（stock_prices の PK は ticker）
  const priceMap = new Map();
  for (const p of prices) priceMap.set(p.ticker, p);

  // 銘柄コードごとに取引をまとめる
  const byCode = new Map();
  for (const t of trades) {
    if (!byCode.has(t.code)) byCode.set(t.code, []);
    byCode.get(t.code).push(t);
  }

  const all = [];

  for (const [code, list] of byCode) {
    // 日付（同日なら登録順）で昇順ソート
    list.sort((a, b) => {
      if (a.trade_date !== b.trade_date) return a.trade_date < b.trade_date ? -1 : 1;
      return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
    });

    let shares = 0;       // 現在の保有株数
    let costTotal = 0;    // 保有分の取得原価合計（手数料込み）
    let avgCost = 0;      // 移動平均取得単価
    let realizedPnl = 0;  // 実現損益（売却損益）の累計
    let nameFromTrades = "";

    for (const t of list) {
      if (t.name) nameFromTrades = t.name; // 後勝ちで控えの銘柄名を保持
      const qty = Number(t.shares) || 0;
      const price = Number(t.price) || 0;
      const fee = Number(t.fee) || 0;

      if (isBuy(t.side)) {
        // 買い：手数料を原価に含めて平均を更新
        costTotal += qty * price + fee;
        shares += qty;
        avgCost = shares > 0 ? costTotal / shares : 0;
      } else {
        // 売り：保有を超える売りはガード（ロングのみ想定）
        const sellQty = Math.min(qty, shares);
        // 実現損益 = 売却代金 − 手数料 − （平均取得単価 × 売却株数）
        realizedPnl += sellQty * price - fee - avgCost * sellQty;
        shares -= sellQty;
        // 平均単価は変えず、原価のみ減らす
        costTotal = avgCost * shares;
        if (shares <= 0) {
          // 全売却 → 建玉をリセット（再取得時は新規扱いになる）
          shares = 0;
          costTotal = 0;
          avgCost = 0;
        }
      }
    }

    // stock_prices には name 列が無いので、表示名は取引控え → コードの順で決める
    const pr = priceMap.get(code);
    const name = nameFromTrades || code;
    const sector = null; // stock_prices に sector 列は無い
    const hasPrice = pr != null && pr.current_price != null;
    const price = hasPrice ? Number(pr.current_price) : null;

    const value = hasPrice ? shares * price : null;
    const unrealizedPnl = hasPrice ? value - costTotal : null;
    const unrealizedPnlPct =
      unrealizedPnl != null && costTotal > 0 ? (unrealizedPnl / costTotal) * 100 : null;

    all.push({
      code,
      name,
      sector,
      shares,
      avgCost,
      cost: costTotal,
      price,
      priceMissing: !hasPrice,
      value,
      unrealizedPnl,
      unrealizedPnlPct,
      realizedPnl,
    });
  }

  // 現在保有中（株数 > 0）と、全売却済み（株数 = 0 だが取引履歴あり）に分割
  const holdings = all
    .filter((s) => s.shares > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const closed = all.filter((s) => s.shares === 0);

  // 合計は「株価が登録済みの保有銘柄」だけで計算（未登録を0円とみなして歪めない）
  const priced = holdings.filter((s) => !s.priceMissing);
  const totalValue = priced.reduce((s, r) => s + r.value, 0);
  const totalCost = priced.reduce((s, r) => s + r.cost, 0);
  const unrealizedPnl = totalValue - totalCost;
  const unrealizedPnlPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;

  // 実現損益は全銘柄（売却済み含む）の累計
  const realizedPnl = all.reduce((s, r) => s + r.realizedPnl, 0);

  // 株価が未登録の保有銘柄数（UIで「/prices で更新を」と促すため）
  const missingPriceCount = holdings.filter((s) => s.priceMissing).length;

  return {
    holdings, // 現在の保有銘柄一覧（株価未登録も含む。合計には含めない）
    closed, // 全売却済みの銘柄（将来の実現損益分析などに利用）
    all, // 全銘柄
    totals: {
      totalValue,
      totalCost,
      unrealizedPnl,
      unrealizedPnlPct,
      realizedPnl,
      missingPriceCount,
    },
  };
}

/**
 * Supabase から trades と stock_prices を取得して集計結果を返す。
 * 失敗時は例外を投げるので、呼び出し側で try/catch する。
 */
export async function loadPortfolio() {
  const [{ data: trades, error: te }, { data: prices, error: pe }] = await Promise.all([
    supabase.from("trades").select("*"),
    supabase.from("stock_prices").select("*"),
  ]);
  if (te) throw te;
  if (pe) throw pe;
  return computePortfolio(trades ?? [], prices ?? []);
}