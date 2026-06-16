"use client";

// =============================================================================
//  保有・監視株価   app/prices/page.jsx  【自動取得＋テクニカル指標保存版】
//  - 「現在値を自動取得」: 全銘柄コードを /api/prices に投げ、現在値に加えて
//    52週高安・出来高・当日騰落率も取得して stock_prices に一括 upsert。
//  - 取得した指標はスクリーナー（/screener）の条件フィルタで使われる。
//
//  ◆事前に一度だけ Supabase SQL Editor で実行しておくこと:
//      alter table stock_prices add column if not exists week52_high numeric;
//      alter table stock_prices add column if not exists week52_low  numeric;
//      alter table stock_prices add column if not exists volume      bigint;
//      alter table stock_prices add column if not exists change_pct  numeric;
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { findStock } from "@/mock/data";
import AuthGuard from "@/components/AuthGuard";
import { Plus, Check, RefreshCw, Trash2, LineChart, Zap } from "lucide-react";

const yen = (n) => (n == null ? "—" : "¥" + Number(n).toLocaleString("ja-JP"));
const fmtTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "未登録";

export default function PricesPage() {
  return (
    <AuthGuard>
      <PricesContent />
    </AuthGuard>
  );
}

function PricesContent() {
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingCode, setSavingCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ ticker: "", price: "" });
  const [registering, setRegistering] = useState(false);

  // 自動取得用の状態
  const [autoFetching, setAutoFetching] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [{ data: priceRows, error: pe }, { data: tradeRows, error: te }] = await Promise.all([
      supabase.from("stock_prices").select("*"),
      supabase.from("trades").select("code, name"),
    ]);
    if (pe || te) { setError((pe || te).message); setLoading(false); return; }

    // trades から銘柄名（最初に見つかったもの）を集める
    const tradeName = new Map();
    for (const t of tradeRows ?? []) if (!tradeName.has(t.code)) tradeName.set(t.code, t.name || "");

    const map = new Map();
    // stock_prices（PKは ticker）
    for (const p of priceRows ?? []) {
      const code = p.ticker;
      map.set(code, {
        code,
        name: tradeName.get(code) || findStock(code)?.name || code,
        current_price: p.current_price,
        updated_at: p.updated_at,
        registered: true,
      });
    }
    // trades にしか無い銘柄
    for (const [code, name] of tradeName) {
      if (!map.has(code)) {
        map.set(code, {
          code,
          name: name || findStock(code)?.name || code,
          current_price: null,
          updated_at: null,
          registered: false,
        });
      }
    }
    setRows([...map.values()].sort((a, b) => a.code.localeCompare(b.code)));
    setDrafts({});
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // 🚀 全銘柄の現在値＋指標を Yahoo からまとめて取得して stock_prices に保存
  async function autoFetchAll() {
    const codes = rows.map((r) => r.code).filter(Boolean);
    if (codes.length === 0) { setError("対象の銘柄がありません。先に銘柄か取引を登録してください。"); return; }

    setAutoFetching(true);
    setError("");
    setAutoMsg("最新の株価・指標を取得中...");
    try {
      const res = await fetch(`/api/prices?codes=${encodeURIComponent(codes.join(","))}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "株価の取得に失敗しました");

      const entries = Object.entries(json.prices || {});
      if (entries.length === 0) throw new Error("株価を取得できませんでした（市場時間外やコード誤りの可能性）");

      const metrics = json.metrics || {};
      const now = new Date().toISOString();
      const payload = entries.map(([ticker, current_price]) => {
        const m = metrics[ticker] || {};
        return {
          ticker,
          current_price: Number(current_price),
          week52_high: m.week52High ?? null,
          week52_low: m.week52Low ?? null,
          volume: m.volume ?? null,
          change_pct: m.changePct ?? null,
          updated_at: now,
        };
      });

      // stock_prices に一括 upsert（PK は ticker）
      const { error: upErr } = await supabase
        .from("stock_prices")
        .upsert(payload, { onConflict: "ticker" });
      if (upErr) throw upErr;

      const failCodes = Object.keys(json.errors || {});
      setAutoMsg(
        `${entries.length} 銘柄の現在値・指標を更新しました` +
        (failCodes.length ? `（取得できず: ${failCodes.join(", ")}）` : "")
      );
      await load();
    } catch (e) {
      setError(String(e.message ?? e));
      setAutoMsg("");
    } finally {
      setAutoFetching(false);
    }
  }

  const isDirty = (r) => {
    const d = drafts[r.code];
    if (d === undefined || d === "") return false;
    const cur = r.current_price == null ? "" : String(r.current_price);
    return String(d) !== cur;
  };

  async function savePrice(r) {
    if (!isDirty(r)) return;
    const value = Number(drafts[r.code]);
    if (!(value >= 0)) { setError("株価は0以上で入力してください"); return; }
    setSavingCode(r.code);
    setError("");
    const { error } = await supabase
      .from("stock_prices")
      .upsert({ ticker: r.code, current_price: value, updated_at: new Date().toISOString() }, { onConflict: "ticker" });
    setSavingCode(null);
    if (error) { setError(error.message); return; }
    setRows((prev) => prev.map((x) => x.code === r.code
      ? { ...x, current_price: value, updated_at: new Date().toISOString(), registered: true } : x));
    setDrafts((d) => { const n = { ...d }; delete n[r.code]; return n; });
  }

  async function registerStock() {
    setError("");
    const ticker = form.ticker.trim();
    if (!ticker) return setError("銘柄コードを入力してください");
    const price = Number(form.price);
    if (!(price >= 0)) return setError("初期株価は0以上で入力してください");
    setRegistering(true);
    const { error } = await supabase
      .from("stock_prices")
      .upsert({ ticker, current_price: price, updated_at: new Date().toISOString() }, { onConflict: "ticker" });
    setRegistering(false);
    if (error) return setError(error.message);
    setForm({ ticker: "", price: "" });
    load();
  }

  // 削除：stock_prices と trades の両方から該当銘柄を消す（＝アプリから完全に除外）
  async function removeStock(r) {
    const ok = window.confirm(
      `「${r.name}（${r.code}）」を削除します。\n監視リストの株価と、この銘柄の取引履歴（trades）も削除され、ダッシュボードの保有からも消えます。よろしいですか？`
    );
    if (!ok) return;
    setError("");
    const [r1, r2] = await Promise.all([
      supabase.from("stock_prices").delete().eq("ticker", r.code),
      supabase.from("trades").delete().eq("code", r.code),
    ]);
    if (r1.error || r2.error) { setError((r1.error || r2.error).message); return; }
    setRows((prev) => prev.filter((x) => x.code !== r.code));
  }

  const formName = findStock(form.ticker)?.name;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-6 md:p-10"
      style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }`}</style>

      <div className="mx-auto max-w-4xl">
        <header className="flex items-end justify-between mb-8">
          <div>
            <p className="text-emerald-400 text-xs font-semibold tracking-widest uppercase mb-1">Prices</p>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">保有・監視株価</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={autoFetchAll}
              disabled={autoFetching || loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-sm font-bold px-3 py-1.5 transition-colors"
              title="登録中・取引済みの全銘柄の現在値＋52週高安・出来高・騰落率を取得します"
            >
              <Zap size={15} className={autoFetching ? "animate-pulse" : ""} />
              {autoFetching ? "取得中..." : "現在値を自動取得"}
            </button>
            <button onClick={load} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 transition-colors">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> 再読み込み
            </button>
          </div>
        </header>

        {/* 監視銘柄の追加 */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 md:p-6 mb-8">
          <h2 className="font-bold text-slate-200 mb-4">監視銘柄を追加</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
            <label className="block">
              <span className="block text-xs text-slate-400 mb-1.5">
                銘柄コード *{formName && <span className="text-emerald-400 font-semibold ml-2">{formName}</span>}
              </span>
              <input className={inputCls} value={form.ticker} onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))} placeholder="6758" />
            </label>
            <label className="block">
              <span className="block text-xs text-slate-400 mb-1.5">初期株価 *</span>
              <input type="number" className={`${inputCls} num`} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="14850" />
            </label>
            <button onClick={registerStock} disabled={registering}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2 transition-colors">
              <Plus size={18} /> {registering ? "登録中..." : "登録"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            ※ 初期株価は仮の値でOK。登録後に「現在値を自動取得」を押せば最新株価＋指標で上書きされます。
          </p>
        </section>

        {autoMsg && <p className="text-emerald-400 text-sm mb-4">{autoMsg}</p>}
        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {/* 一覧 */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-3">
            <h2 className="font-bold text-slate-200">登録銘柄</h2>
            <span className="num text-xs text-slate-500">{rows.length} 銘柄</span>
          </div>

          {loading ? (
            <p className="px-6 py-10 text-center text-slate-500">読み込み中...</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-slate-500">銘柄がありません。上のフォームから追加してください。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs border-b border-slate-800">
                    <th className="text-left font-medium px-5 md:px-6 py-3">銘柄</th>
                    <th className="text-right font-medium px-3 py-3">現在の株価</th>
                    <th className="text-left font-medium px-3 py-3">最終更新</th>
                    <th className="px-3 py-3"></th>
                    <th className="px-5 md:px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dirty = isDirty(r);
                    const saving = savingCode === r.code;
                    const draftVal = drafts[r.code] !== undefined ? drafts[r.code] : (r.current_price == null ? "" : r.current_price);
                    return (
                      <tr key={r.code} className="border-b border-slate-800 hover:bg-slate-800 transition-colors">
                        {/* 銘柄名クリックで分析画面へ */}
                        <td className="px-5 md:px-6 py-3">
                          <Link href={`/analysis?code=${encodeURIComponent(r.code)}`} className="group inline-flex items-center gap-1.5">
                            <span>
                              <span className="font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors">{r.name}</span>
                              <span className="num block text-xs text-slate-500">
                                {r.code}{!r.registered && <span className="ml-2 text-amber-400">未登録</span>}
                              </span>
                            </span>
                            <LineChart size={14} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
                          </Link>
                        </td>
                        {/* 価格インライン編集 */}
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <span className="text-slate-500">¥</span>
                            <input type="number" min="0" value={draftVal}
                              onChange={(e) => setDrafts((d) => ({ ...d, [r.code]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && savePrice(r)}
                              placeholder="0"
                              className={`num w-28 text-right rounded-lg bg-slate-800 border px-2 py-1.5 text-slate-100 focus:outline-none ${dirty ? "border-emerald-500" : "border-slate-700"}`} />
                          </div>
                        </td>
                        <td className="num px-3 py-3 text-xs text-slate-500">{fmtTime(r.updated_at)}</td>
                        {/* 保存 */}
                        <td className="px-3 py-3 text-right">
                          <button onClick={() => savePrice(r)} disabled={!dirty || saving}
                            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              dirty ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-600 cursor-default"
                            }`}>
                            <Check size={14} /> {saving ? "保存中" : "保存"}
                          </button>
                        </td>
                        {/* 削除 */}
                        <td className="px-5 md:px-6 py-3 text-right">
                          <button onClick={() => removeStock(r)} className="text-slate-500 hover:text-rose-400 transition-colors" title="削除">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-center text-xs text-slate-600 mt-6">
          ※ 銘柄名をクリックするとチャート（分析画面）へ移動します。削除は取引履歴も含めて完全に削除します。
        </p>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 focus:outline-none px-3 py-2 text-slate-100 placeholder-slate-600";