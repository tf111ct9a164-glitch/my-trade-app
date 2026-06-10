"use client";

// =============================================================================
//  取引入力・一覧画面   app/trades/page.jsx
//  Next.js (App Router) + Tailwind CSS + Supabase
//
//  事前準備:
//    npm install @supabase/supabase-js
//    .env.local に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を設定
//    lib/supabase.js を作成（下のコメント参照）
// =============================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";

// ---- 表示用ヘルパー ---------------------------------------------------------
const yen = (n) => "¥" + Math.round(Number(n) || 0).toLocaleString("ja-JP");

// 入力フォームの初期値
const EMPTY = {
  code: "",
  name: "",
  side: "buy",
  shares: "",
  price: "",
  fee: "0",
  trade_date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
};

export default function TradesPage() {
  const [form, setForm] = useState(EMPTY);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 取引履歴を取得（売買日の新しい順）
  async function loadTrades() {
    setLoading(true);
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    else setTrades(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadTrades();
  }, []);

  // フォーム入力ハンドラ
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // 保存
  async function handleSave() {
    setError("");

    // 簡易バリデーション
    if (!form.code.trim()) return setError("銘柄コードを入力してください");
    if (!(Number(form.shares) > 0)) return setError("株数は1以上で入力してください");
    if (!(Number(form.price) >= 0)) return setError("単価を正しく入力してください");

    setSaving(true);
    const { error } = await supabase.from("trades").insert({
      code: form.code.trim(),
      name: form.name.trim() || null,
      side: form.side,
      shares: Number(form.shares),
      price: Number(form.price),
      fee: Number(form.fee) || 0,
      trade_date: form.trade_date,
    });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }
    // フォームを初期化（売買区分と日付は引き継ぐと連続入力が楽）
    setForm({ ...EMPTY, side: form.side, trade_date: form.trade_date });
    loadTrades();
  }

  // 削除
  async function handleDelete(id) {
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) setError(error.message);
    else setTrades((t) => t.filter((x) => x.id !== id));
  }

  return (
    <div
      className="min-h-screen w-full bg-slate-950 text-slate-100 p-6 md:p-10"
      style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }`}</style>

      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-emerald-400 text-xs font-semibold tracking-widest uppercase mb-1">
            Trades
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">取引記録</h1>
        </header>

        {/* ---- 入力フォーム ---------------------------------------------- */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 md:p-6 mb-8">
          <h2 className="font-bold text-slate-200 mb-4">新しい取引を記録</h2>

          {/* 売買区分トグル */}
          <div className="flex gap-2 mb-4">
            <SideButton
              active={form.side === "buy"}
              onClick={() => setForm((f) => ({ ...f, side: "buy" }))}
              icon={<TrendingUp size={16} />}
              label="買い"
              accent="emerald"
            />
            <SideButton
              active={form.side === "sell"}
              onClick={() => setForm((f) => ({ ...f, side: "sell" }))}
              icon={<TrendingDown size={16} />}
              label="売り"
              accent="rose"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="銘柄コード *">
              <input
                className={inputCls}
                value={form.code}
                onChange={update("code")}
                placeholder="7203"
              />
            </Field>
            <Field label="銘柄名（任意）">
              <input
                className={inputCls}
                value={form.name}
                onChange={update("name")}
                placeholder="トヨタ自動車"
              />
            </Field>
            <Field label="売買日">
              <input type="date" className={inputCls} value={form.trade_date} onChange={update("trade_date")} />
            </Field>
            <Field label="株数 *">
              <input
                type="number"
                min="0"
                className={`${inputCls} num`}
                value={form.shares}
                onChange={update("shares")}
                placeholder="100"
              />
            </Field>
            <Field label="単価 *">
              <input
                type="number"
                min="0"
                className={`${inputCls} num`}
                value={form.price}
                onChange={update("price")}
                placeholder="2480"
              />
            </Field>
            <Field label="手数料">
              <input
                type="number"
                min="0"
                className={`${inputCls} num`}
                value={form.fee}
                onChange={update("fee")}
                placeholder="0"
              />
            </Field>
          </div>

          {/* 約定代金プレビュー */}
          <div className="num text-sm text-slate-400 mt-4">
            約定代金（概算）:{" "}
            <span className="text-slate-100 font-semibold">
              {yen(Number(form.shares) * Number(form.price) + Number(form.fee))}
            </span>
          </div>

          {error && <p className="text-rose-400 text-sm mt-3">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 transition-colors"
          >
            <Plus size={18} />
            {saving ? "保存中..." : "取引を記録する"}
          </button>
        </section>

        {/* ---- 取引履歴一覧 ---------------------------------------------- */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-3">
            <h2 className="font-bold text-slate-200">取引履歴</h2>
            <span className="num text-xs text-slate-500">{trades.length} 件</span>
          </div>

          {loading ? (
            <p className="px-6 py-10 text-center text-slate-500">読み込み中...</p>
          ) : trades.length === 0 ? (
            <p className="px-6 py-10 text-center text-slate-500">まだ取引がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs border-b border-slate-800">
                    <th className="text-left font-medium px-5 md:px-6 py-3">売買日</th>
                    <th className="text-left font-medium px-3 py-3">区分</th>
                    <th className="text-left font-medium px-3 py-3">銘柄</th>
                    <th className="text-right font-medium px-3 py-3">株数</th>
                    <th className="text-right font-medium px-3 py-3">単価</th>
                    <th className="text-right font-medium px-3 py-3">約定代金</th>
                    <th className="px-5 md:px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => {
                    const buy = t.side === "buy";
                    const amount = t.shares * t.price + (t.fee || 0);
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-slate-800 hover:bg-slate-800 transition-colors"
                      >
                        <td className="num px-5 md:px-6 py-3 text-slate-400">{t.trade_date}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                              buy
                                ? "bg-emerald-500 bg-opacity-15 text-emerald-400"
                                : "bg-rose-500 bg-opacity-15 text-rose-400"
                            }`}
                          >
                            {buy ? "買い" : "売り"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-100">{t.name || "—"}</div>
                          <div className="num text-xs text-slate-500">{t.code}</div>
                        </td>
                        <td className="num text-right px-3 py-3 text-slate-300">{t.shares}</td>
                        <td className="num text-right px-3 py-3 text-slate-300">{yen(t.price)}</td>
                        <td className="num text-right px-3 py-3 text-slate-100 font-semibold">
                          {yen(amount)}
                        </td>
                        <td className="px-5 md:px-6 py-3 text-right">
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="text-slate-500 hover:text-rose-400 transition-colors"
                            title="削除"
                          >
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
      </div>
    </div>
  );
}

// ---- 小さな部品 -------------------------------------------------------------
const inputCls =
  "w-full rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 focus:outline-none px-3 py-2 text-slate-100 placeholder-slate-600";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function SideButton({ active, onClick, icon, label, accent }) {
  const on =
    accent === "emerald"
      ? "bg-emerald-500 text-slate-950"
      : "bg-rose-500 text-slate-950";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 font-semibold text-sm transition-colors ${
        active ? on : "bg-slate-800 text-slate-400 hover:bg-slate-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
