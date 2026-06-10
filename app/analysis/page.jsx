"use client";

// =============================================================================
//  銘柄分析画面（正解吸着・軽量化・検証ログ完全統合版）   app/analysis/page.jsx
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation"; 
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { findStock, SCREENER_STOCKS } from "@/mock/data";
import AuthGuard from "@/components/AuthGuard";

const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });

const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");
const RANGES = ["1mo", "3mo", "6mo", "1y", "2y"];

const BUY_COLOR = "#22d3ee";  // 水色
const SELL_COLOR = "#fbbf24"; // ゴールド

// コードを綺麗に整えるヘルパー
const normCode = (v) => {
  if (!v) return "";
  let s = String(v).trim().toUpperCase();
  if (s.endsWith(".T")) {
    s = s.slice(0, -2);
  }
  s = s.replace(/^([0-9]{3}[0-9A-Z])0$/, "$1");
  return s.replace(/\s+/g, "");
};

// 🌟 本物の列名 stock_code を最優先に読み込む
const journalCode = (e) => normCode(e.stock_code ?? e.code ?? e.ticker ?? e.symbol ?? "");

export default function AnalysisPage() {
  return (
    <AuthGuard>
      <AnalysisContent />
    </AuthGuard>
  );
}

function AnalysisContent() {
  const searchParams = useSearchParams();
  const urlCode = searchParams.get("code"); 

  const [holdings, setHoldings] = useState([]);
  const [selected, setSelected] = useState("7203");
  const [manual, setManual] = useState("");
  const [range, setRange] = useState("1y");
  const [fetchedStockName, setFetchedStockName] = useState(""); 

  const [showMA, setShowMA] = useState(true);
  const [maShort, setMaShort] = useState(5);   
  const [maLong, setMaLong] = useState(25);   

  const [bars, setBars] = useState([]);
  const [journals, setJournals] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const liveInputName = useMemo(() => {
    const code = manual.trim();
    if (code.length < 4) return null;
    const found = findStock(code);
    if (found) return found.name;
    const held = holdings.find(h => normCode(h.code) === normCode(code));
    return held ? held.name : "東証全銘柄対応コード";
  }, [manual, holdings]);

  useEffect(() => {
    supabase
      .from("trades")
      .select("code, name")
      .then(({ data }) => {
        if (!data) return;
        const map = new Map();
        for (const t of data) {
          const c = normCode(t.code);
          if (!map.has(c)) map.set(c, t.name || t.code);
        }
        const list = [...map.entries()].map(([code, name]) => ({ code, name }));
        setHoldings(list);
        
        if (urlCode) {
          setSelected(urlCode);
        } else if (list.length > 0) {
          setSelected(list[0].code);
        }
      });
  }, [urlCode]);

  useEffect(() => {
    let cancelled = false;
    
    async function run() {
      setLoading(true);
      setError("");
      setFetchedStockName("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const chartRes = await fetch(
          `/api/candles?code=${encodeURIComponent(selected)}&range=${range}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } }
        );
        const chartJson = await chartRes.json();
        if (cancelled) return;
        if (!chartRes.ok) throw new Error(chartJson.error || "チャート取得に失敗しました");
        
        setBars(chartJson.bars ?? []);
        
        if (chartJson.stockName || chartJson.name) {
          setFetchedStockName(chartJson.stockName || chartJson.name);
        }

      } catch (e) {
        if (!cancelled) {
          setError(String(e.message ?? e));
          setBars([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [selected, range]);

  // 売買ノート取得
  useEffect(() => {
    const target = normCode(selected);
    supabase
      .from("trade_journal")
      .select("*")
      .then(({ data, error }) => {
        if (error) { console.error(error.message); setJournals([]); return; }
        
        console.log("=== 285A特有の照合チェック ===");
        console.log("sel:", target, "codes:", (data ?? []).map((e) => journalCode(e)));
        console.log("============================");

        const rows = (data ?? []).filter((e) => journalCode(e) === target);
        setJournals(rows);
      });
  }, [selected]);

  // 🚀 【Claude先生直伝】正解データ完全同期・吸着型マーカーロジック
  const chartMarkers = useMemo(() => {
    if (bars.length === 0 || journals.length === 0) return [];
    
    // bars の time をそのまま「正解の時刻値」として使う（型・形式のズレを根絶）
    const times = bars.map((b) => b.time);
    const first = times[0];
    const last = times[times.length - 1];
    
    const snap = (raw) => {
      if (!raw) return null;
      
      // ローカル日付 "YYYY-MM-DD"（タイムゾーンずれ防止）
      const dt = new Date(raw);
      const p = (n) => String(n).padStart(2, "0");
      const d = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
      
      if (d <= String(first)) return first; // 期間より前 → 先頭の足の time
      if (d >= String(last)) return last;   // 期間より後 → 最後の足の time
      
      let chosen = first;
      for (const t of times) { 
        if (String(t) <= d) chosen = t; 
        else break; 
      }
      return chosen; // ← 必ず bars に実在する time オブジェクトを返す
    };

    const ms = [];
    for (const e of journals) {
      const entryAt = e.entry_at ?? e.entry_date ?? e.entryAt ?? null;
      const exitAt  = e.exit_at  ?? e.exit_date  ?? e.exitAt  ?? null;

      if (entryAt) {
        const time = snap(entryAt);
        if (time != null) ms.push({ time, position: "belowBar", color: BUY_COLOR, shape: "arrowUp", text: "BUY" });
      }
      if (exitAt) {
        const time = snap(exitAt);
        if (time != null) ms.push({ time, position: "aboveBar", color: SELL_COLOR, shape: "arrowDown", text: "SELL" });
      }
    }
    
    // Lightweight Charts 必須ルール：時刻昇順にソート
    ms.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    
    // 🔍 【一撃検証用デバッグログ】
    console.log("--- マーカー生成結果ログ ---");
    console.log("markers length:", ms.length, "first marker:", ms[0]);
    console.log("----------------------------");
    
    return ms;
  }, [journals, bars]);

  const displayName = useMemo(() => {
    if (fetchedStockName) return fetchedStockName;
    const target = normCode(selected);
    const local = findStock(target)?.name || holdings.find((x) => normCode(x.code) === target)?.name;
    if (local) return local;
    return `銘柄コード: ${selected}`;
  }, [fetchedStockName, selected, holdings]);

  const last = bars.length ? bars[bars.length - 1].close : null;

  function applyManual() {
    const code = manual.trim();
    if (code) {
      setSelected(code);
      setManual("");
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-emerald-400 text-xs font-semibold tracking-widest uppercase mb-1">Analysis</p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">銘柄分析</h1>
        </header>

        {/* セレクタ */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 md:p-6 mb-6">
          {holdings.length > 0 && (
            <div className="mb-4">
              <span className="block text-xs text-slate-400 mb-2">保有銘柄</span>
              <div className="flex flex-wrap gap-2">
                {holdings.map((h) => (
                  <button
                    key={h.code}
                    onClick={() => setSelected(h.code)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      normCode(selected) === normCode(h.code) ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {h.name} <span className="text-xs opacity-70 ml-1">{h.code}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs text-slate-400 mb-1.5">主要銘柄から選ぶ</span>
              <select className={inputCls} value={selected} onChange={(e) => setSelected(e.target.value)}>
                {SCREENER_STOCKS.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}（{s.code}）</option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="flex justify-between items-center mb-1.5">
                <span className="block text-xs text-slate-400">コードを直接入力</span>
                {liveInputName && (
                  <span className="text-xs text-emerald-400 font-bold animate-pulse">➔ {liveInputName}</span>
                )}
              </div>
              <div className="flex gap-2">
                <input className={inputCls} value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyManual()} placeholder="例: 285A" />
                <button onClick={applyManual} className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 text-sm">表示</button>
              </div>
            </label>
          </div>

          <div className="flex gap-2 mt-4">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${range === r ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{r}</button>
            ))}
          </div>
        </section>

        {/* チャート */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 bg-opacity-60 p-5 md:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800/60">
            <div>
              <h2 className="font-bold text-slate-200 text-lg flex items-center gap-2">
                {displayName}
                <span className="text-xs font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{selected.toUpperCase()}.T</span>
              </h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-3 border border-slate-800 bg-slate-950/40 px-3 py-2 rounded-xl">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={showMA} onChange={(e) => setShowMA(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 h-3.5 w-3.5" />
                  <span className="text-slate-300">移動平均線</span>
                </label>
                {showMA && (
                  <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#a78bfa]" />
                      <input type="number" value={maShort} onChange={(e) => setMaShort(Math.max(1, Number(e.target.value)))} className="w-10 bg-slate-900 border border-slate-700 rounded px-1 text-center font-mono text-slate-300 focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#f8fafc]" />
                      <input type="number" value={maLong} onChange={(e) => setMaLong(Math.max(1, Number(e.target.value)))} className="w-10 bg-slate-900 border border-slate-700 rounded px-1 text-center font-mono text-slate-300 focus:outline-none" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 text-slate-400 border border-slate-800 bg-slate-950/60 px-3 py-2 rounded-xl">
                <span style={{ color: BUY_COLOR }}>▲ BUY</span>
                <span style={{ color: SELL_COLOR }}>▼ SELL</span>
              </div>

              {last != null && (
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Close</div>
                  <div className="text-base font-bold font-mono text-emerald-400">{yen(last)}</div>
                </div>
              )}
            </div>
          </div>

          {loading ? ( <p className="py-20 text-center text-slate-500">読み込み中...</p> ) : error ? ( <p className="py-20 text-center text-rose-400 text-sm">エラー：{error}</p> ) : bars.length === 0 ? ( <p className="py-20 text-center text-slate-500">データがありません</p> ) : (
            <CandleChart data={bars} height={420} markers={chartMarkers} showMA={showMA} maShort={maShort} maLong={maLong} />
          )}
        </section>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 focus:outline-none px-3 py-2 text-slate-100 placeholder-slate-600";