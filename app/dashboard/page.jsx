"use client";

// =============================================================================
//  ダッシュボード（認証保護つき・資産推移グラフ復活版）  app/dashboard/page.jsx
//  - AuthGuard で未ログイン時は /login へ
//  - 表示のたびに当日の総資産を daily_assets に記録（recordDailySnapshot）
//  - daily_assets の履歴から資産推移の折れ線グラフを描画
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Wallet,
  Layers,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { loadPortfolio } from "@/lib/portfolio";
import { recordDailySnapshot, loadAssetHistory } from "@/lib/snapshots";
import AuthGuard from "@/components/AuthGuard";

// ---- 表示用ヘルパー ---------------------------------------------------------
const yen = (n) => "¥" + Math.round(Number(n) || 0).toLocaleString("ja-JP");
const signedYen = (n) => (n >= 0 ? "+" : "−") + yen(Math.abs(n));
const pct = (n) => (n >= 0 ? "+" : "") + (Number(n) || 0).toFixed(2) + "%";
const EMERALD = "#10b981";
const ROSE = "#f43f5e";

// 認証ガードで包むだけのラッパー
export default function Dashboard() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const portfolio = await loadPortfolio();
      setData(portfolio);

      // 当日の総資産を記録 → 最新の推移を取得
      await recordDailySnapshot(portfolio.totals);
      setHistory(await loadAssetHistory());
    } catch (e) {
      setError(e.message ?? "データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const t = data?.totals;
  const holdings = data?.holdings ?? [];
  const pricedHoldings = holdings.filter((h) => !h.priceMissing);

  return (
    <div
      className="min-h-screen w-full bg-slate-950 text-slate-100 p-6 md:p-10"
      style={{
        fontFamily: "'Manrope', system-ui, sans-serif",
        backgroundImage:
          "radial-gradient(900px 500px at 85% -10%, rgba(16,185,129,0.10), transparent), radial-gradient(700px 400px at 0% 0%, rgba(56,189,248,0.06), transparent)",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }`}</style>

      <div className="mx-auto max-w-6xl">
        {/* ヘッダー -------------------------------------------------------- */}
        <header className="flex items-end justify-between mb-8">
          <div>
            <p className="text-emerald-400 text-xs font-semibold tracking-widest uppercase mb-1">
              Portfolio
            </p>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">ダッシュボード</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              更新
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-rose-400 transition-colors"
            >
              <LogOut size={15} />
              ログアウト
            </button>
          </div>
        </header>

        {error && (
          <p className="rounded-xl bg-rose-500 bg-opacity-10 border border-rose-800 text-rose-300 text-sm px-4 py-3 mb-6">
            {error}
          </p>
        )}

        {loading && !data ? (
          <p className="px-6 py-20 text-center text-slate-500">読み込み中...</p>
        ) : holdings.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* 株価未登録の警告 ------------------------------------------- */}
            {t.missingPriceCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500 bg-opacity-10 border border-amber-800 text-amber-300 text-sm px-4 py-3 mb-6">
                <AlertTriangle size={16} />
                <span>{t.missingPriceCount} 銘柄の株価が未登録のため合計に含まれていません。</span>
                <Link href="/prices" className="underline font-semibold hover:text-amber-200">
                  株価を更新する
                </Link>
              </div>
            )}

            {/* KPIカード -------------------------------------------------- */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiCard icon={<Wallet size={18} />} label="総資産（評価額）" value={yen(t.totalValue)} accent="emerald" />
              <KpiCard icon={<Layers size={18} />} label="投資元本" value={yen(t.totalCost)} accent="slate" />
              <KpiCard
                icon={t.unrealizedPnl >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                label="含み損益"
                value={signedYen(t.unrealizedPnl)}
                sub={pct(t.unrealizedPnlPct)}
                accent={t.unrealizedPnl >= 0 ? "emerald" : "rose"}
              />
              <KpiCard
                icon={t.realizedPnl >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                label="実現損益（累計）"
                value={signedYen(t.realizedPnl)}
                accent={t.realizedPnl > 0 ? "emerald" : t.realizedPnl < 0 ? "rose" : "slate"}
              />
            </section>

            {/* 資産推移（折れ線） ----------------------------------------- */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 bg-opacity-60 p-5 md:p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-200">資産推移</h2>
                <span className="text-xs text-slate-500">日次記録</span>
              </div>
              {history.length >= 2 ? (
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={history} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={EMERALD} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        stroke="#64748b"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={64}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => "¥" + (v / 10000).toFixed(0) + "万"}
                      />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#e2e8f0" }}
                        formatter={(v) => [yen(v), "総資産"]}
                      />
                      <Area type="monotone" dataKey="value" stroke={EMERALD} strokeWidth={2.5} fill="url(#g)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-slate-500 text-sm">
                  資産推移は日々の記録が貯まると表示されます。<br />
                  （ダッシュボードを開くたびに当日分が記録され、2日分以上たまるとグラフになります）
                </p>
              )}
            </section>

            {/* 保有銘柄の構成（評価額） ----------------------------------- */}
            {pricedHoldings.length > 0 && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 bg-opacity-60 p-5 md:p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-slate-200">保有銘柄の構成（評価額）</h2>
                  <span className="text-xs text-slate-500">含み益＝緑 / 含み損＝赤</span>
                </div>
                <div style={{ width: "100%", height: Math.max(160, pricedHoldings.length * 46) }}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical" data={pricedHoldings} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid stroke="#1e293b" horizontal={false} />
                      <XAxis
                        type="number"
                        stroke="#64748b"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        tickFormatter={(v) => "¥" + (v / 10000).toFixed(0) + "万"}
                      />
                      <YAxis type="category" dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={12} width={120} />
                      <Tooltip
                        cursor={{ fill: "rgba(148,163,184,0.08)" }}
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#e2e8f0" }}
                        formatter={(v) => [yen(v), "評価額"]}
                      />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {pricedHoldings.map((h) => (
                          <Cell key={h.code} fill={h.unrealizedPnl >= 0 ? EMERALD : ROSE} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* 保有銘柄一覧 ----------------------------------------------- */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 bg-opacity-60 overflow-hidden">
              <h2 className="font-bold text-slate-200 px-5 md:px-6 pt-5 pb-3">保有銘柄</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs border-b border-slate-800">
                      <th className="text-left font-medium px-5 md:px-6 py-3">銘柄</th>
                      <th className="text-right font-medium px-3 py-3">株数</th>
                      <th className="text-right font-medium px-3 py-3 hidden sm:table-cell">平均取得単価</th>
                      <th className="text-right font-medium px-3 py-3">現在値</th>
                      <th className="text-right font-medium px-3 py-3">評価額</th>
                      <th className="text-right font-medium px-5 md:px-6 py-3">含み損益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((r) => {
                      const up = (r.unrealizedPnl ?? 0) >= 0;
                      return (
                        <tr key={r.code} className="border-b border-slate-800 hover:bg-slate-800 transition-colors">
                          <td className="px-5 md:px-6 py-3">
                            <div className="font-semibold text-slate-100">{r.name}</div>
                            <div className="num text-xs text-slate-500">{r.code}</div>
                          </td>
                          <td className="num text-right px-3 py-3 text-slate-300">{r.shares}</td>
                          <td className="num text-right px-3 py-3 text-slate-400 hidden sm:table-cell">{yen(r.avgCost)}</td>
                          {r.priceMissing ? (
                            <td colSpan={3} className="px-5 md:px-6 py-3 text-right">
                              <Link href="/prices" className="text-amber-400 text-xs underline">
                                株価未登録 → 更新する
                              </Link>
                            </td>
                          ) : (
                            <>
                              <td className="num text-right px-3 py-3 text-slate-200">{yen(r.price)}</td>
                              <td className="num text-right px-3 py-3 text-slate-200">{yen(r.value)}</td>
                              <td className="px-5 md:px-6 py-3 text-right">
                                <div className={`num font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                                  {signedYen(r.unrealizedPnl)}
                                </div>
                                <div className={`num text-xs ${up ? "text-emerald-500" : "text-rose-500"}`}>
                                  {pct(r.unrealizedPnlPct)}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ---- 部品 -------------------------------------------------------------------
function KpiCard({ icon, label, value, sub, accent = "slate" }) {
  const accentText =
    accent === "emerald" ? "text-emerald-400" : accent === "rose" ? "text-rose-400" : "text-slate-300";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 bg-opacity-60 p-4 md:p-5">
      <div className="flex items-center gap-2 text-slate-400 mb-3">
        <span className={accentText}>{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="num text-xl md:text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className={`num text-sm font-semibold mt-1 ${accentText}`}>{sub}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 bg-opacity-60 p-10 text-center">
      <p className="text-slate-300 font-semibold mb-2">まだ保有銘柄がありません</p>
      <p className="text-slate-500 text-sm mb-5">取引を記録して株価を登録すると、ここに資産状況が表示されます。</p>
      <div className="flex items-center justify-center gap-3">
        <Link href="/trades" className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 text-sm">
          取引を記録する
        </Link>
        <Link href="/prices" className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2 text-sm">
          株価を更新する
        </Link>
      </div>
    </div>
  );
}
