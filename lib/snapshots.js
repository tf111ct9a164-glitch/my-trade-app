// =============================================================================
//  lib/snapshots.js
//  その日時点の総資産を daily_assets に記録し、資産推移を取得するロジック。
// =============================================================================

import { supabase } from "@/lib/supabase";
import { loadPortfolio } from "@/lib/portfolio";

const today = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

/**
 * その日の総資産スナップショットを記録（upsert）する。
 * 同じ日に複数回呼んでも 1 レコードに上書きされる（最新値が残る）。
 *
 * @param {object|null} totals  computePortfolio の totals。未指定なら内部で再計算。
 */
export async function recordDailySnapshot(totals = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // 未ログインなら何もしない

  if (!totals) {
    ({ totals } = await loadPortfolio());
  }

  // 保有銘柄が無い（総資産0かつ元本0）状態では記録しない＝無意味な点を作らない
  if (totals.totalValue === 0 && totals.totalCost === 0) return;

  const { error } = await supabase.from("daily_assets").upsert(
    {
      user_id: user.id,
      snapshot_date: today(),
      total_value: totals.totalValue,
      total_cost: totals.totalCost,
      unrealized_pnl: totals.unrealizedPnl,
    },
    { onConflict: "user_id,snapshot_date" }
  );

  if (error) throw error;
}

/**
 * 資産推移を古い順で取得し、チャート用の { date, value } 配列に整形して返す。
 */
export async function loadAssetHistory() {
  const { data, error } = await supabase
    .from("daily_assets")
    .select("snapshot_date, total_value, total_cost")
    .order("snapshot_date", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    date: r.snapshot_date.slice(5).replace("-", "/"), // "MM/DD"
    value: Number(r.total_value),
    cost: r.total_cost == null ? null : Number(r.total_cost),
  }));
}
