"use client";

// =============================================================================
//  東証全銘柄対応・爆速スクリーニング画面   app/screener/page.jsx
//  【テクニカル軸版】株価レンジに加えて、当日騰落率・52週レンジ内の位置・出来高で絞り込み。
//  指標は stock_prices に保存済みのものを使う（/prices の「現在値を自動取得」で取得）。
//  ※ PER/PBR/配当などの財務指標は次フェーズ（J-Quants 統合）で追加予定。
// =============================================================================

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";

export default function ScreenerPage() {
  return (
    <AuthGuard>
      <ScreenerContent />
    </AuthGuard>
  );
}

function ScreenerContent() {
  const [allStocks, setAllStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ active: 0, total: 0 });

  // 検索・フィルター用の状態
  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  // テクニカル軸
  const [minVolume, setMinVolume] = useState("");
  const [minPos, setMinPos] = useState("");   // 52週レンジ内の位置(%) 下限
  const [maxPos, setMaxPos] = useState("");   // 52週レンジ内の位置(%) 上限
  const [minChange, setMinChange] = useState(""); // 当日騰落率(%) 下限
  const [maxChange, setMaxChange] = useState(""); // 当日騰落率(%) 上限

  // 監視リスト登録アニメーション・制御用
  const [watchActionMsg, setWatchActionMsg] = useState("");

  // 1. マージ済み全銘柄データのロード
  useEffect(() => {
    async function loadScreenerData() {
      try {
        setLoading(true);
        const res = await fetch("/api/screen");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "データ取得に失敗しました");

        setAllStocks(json.stocks ?? []);
        setProgress({ active: json.activeCount ?? 0, total: json.totalCount ?? 0 });
      } catch (e) {
        setError(String(e.message ?? e));
      } finally {
        setLoading(false);
      }
    }
    loadScreenerData();
  }, []);

  // 2. 業種プルダウン用
  const sectors = useMemo(() => {
    const list = allStocks.map((s) => s.sector).filter(Boolean);
    return [...new Set(list)].sort();
  }, [allStocks]);

  // 3. 52週レンジ内の位置(%) を計算して各銘柄に付与（0%=52週安値, 100%=52週高値）
  const enriched = useMemo(() => {
    return allStocks.map((s) => {
      const pos =
        s.price != null && s.week52High != null && s.week52Low != null && s.week52High > s.week52Low
          ? ((s.price - s.week52Low) / (s.week52High - s.week52Low)) * 100
          : null;
      return { ...s, positionPct: pos };
    });
  }, [allStocks]);

  // 4. クライアント側で爆速条件フィルタリング
  const filteredStocks = useMemo(() => {
    return enriched.filter((s) => {
      // まだ株価が取得できていない銘柄は除外
      if (s.price === null) return false;

      if (search && !s.code.includes(search) && !s.name.includes(search)) return false;
      if (selectedSector && s.sector !== selectedSector) return false;
      if (minPrice && s.price < Number(minPrice)) return false;
      if (maxPrice && s.price > Number(maxPrice)) return false;

      // テクニカル軸：指定された条件は、その指標が未取得（null）の銘柄を除外する
      if (minVolume && (s.volume == null || s.volume < Number(minVolume))) return false;
      if (minPos && (s.positionPct == null || s.positionPct < Number(minPos))) return false;
      if (maxPos && (s.positionPct == null || s.positionPct > Number(maxPos))) return false;
      if (minChange && (s.changePct == null || s.changePct < Number(minChange))) return false;
      if (maxChange && (s.changePct == null || s.changePct > Number(maxChange))) return false;

      return true;
    });
  }, [enriched, search, selectedSector, minPrice, maxPrice, minVolume, minPos, maxPos, minChange, maxChange]);

  // 5. 監視リスト（= stock_prices）への追加。冪等で安全（trades は触らない）。
  async function addToWatchlist(stock) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error: err } = await supabase.from("stock_prices").upsert({
        ticker: stock.code,
        current_price: stock.price ?? 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ticker" });

      if (err) throw err;

      setWatchActionMsg(`🟢 ${stock.name} (${stock.code}) を監視リストに追加しました！`);
      setTimeout(() => setWatchActionMsg(""), 3000);
    } catch (e) {
      setWatchActionMsg(`❌ 追加失敗: ${e.message}`);
      setTimeout(() => setWatchActionMsg(""), 3000);
    }
  }

  const resetFilters = () => {
    setSearch(""); setSelectedSector(""); setMinPrice(""); setMaxPrice("");
    setMinVolume(""); setMinPos(""); setMaxPos(""); setMinChange(""); setMaxChange("");
  };

  // 表示件数を最大300件に制限
  const displayStocks = useMemo(() => filteredStocks.slice(0, 300), [filteredStocks]);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">

        <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-emerald-400 text-xs font-semibold tracking-widest uppercase mb-1">Screener</p>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">東証全銘柄スクリーニング</h1>
          </div>
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs text-slate-400 font-mono">
            指標取得済み: <span className="text-emerald-400 font-bold">{progress.active}</span> / 全 {progress.total} 銘柄
          </div>
        </header>

        {watchActionMsg && (
          <div className="mb-4 p-3 bg-slate-900 border border-emerald-500/30 text-emerald-400 text-sm font-semibold rounded-xl animate-fade-in">
            {watchActionMsg}
          </div>
        )}

        {/* 🛠️ フィルターパネル */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 md:p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block">
              <span className="block text-xs text-slate-400 mb-1.5">コード または 銘柄名</span>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="例: 5803" className={inputCls} />
            </label>

            <label className="block">
              <span className="block text-xs text-slate-400 mb-1.5">業種・セクター</span>
              <select value={selectedSector} onChange={(e) => setSelectedSector(e.target.value)} className={inputCls}>
                <option value="">すべての業種</option>
                {sectors.map((sec) => (<option key={sec} value={sec}>{sec}</option>))}
              </select>
            </label>

            <label className="block lg:col-span-2">
              <span className="block text-xs text-slate-400 mb-1.5">株価レンジ (円)</span>
              <div className="flex items-center gap-2">
                <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="下限なし" className={inputCls} />
                <span className="text-slate-600">〜</span>
                <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="上限なし" className={inputCls} />
              </div>
            </label>

            <label className="block">
              <span className="block text-xs text-slate-400 mb-1.5">出来高 下限 (株)</span>
              <input type="number" value={minVolume} onChange={(e) => setMinVolume(e.target.value)} placeholder="例: 1000000" className={`${inputCls} font-mono`} />
            </label>

            <label className="block lg:col-span-2">
              <span className="block text-xs text-slate-400 mb-1.5">52週レンジ内の位置 (%)<span className="text-slate-600 ml-1">0=安値 / 100=高値</span></span>
              <div className="flex items-center gap-2">
                <input type="number" value={minPos} onChange={(e) => setMinPos(e.target.value)} placeholder="下限" className={`${inputCls} font-mono`} />
                <span className="text-slate-600">〜</span>
                <input type="number" value={maxPos} onChange={(e) => setMaxPos(e.target.value)} placeholder="上限" className={`${inputCls} font-mono`} />
              </div>
            </label>

            <label className="block">
              <span className="block text-xs text-slate-400 mb-1.5">当日騰落率 (%)</span>
              <div className="flex items-center gap-2">
                <input type="number" value={minChange} onChange={(e) => setMinChange(e.target.value)} placeholder="下限" className={`${inputCls} font-mono`} />
                <span className="text-slate-600">〜</span>
                <input type="number" value={maxChange} onChange={(e) => setMaxChange(e.target.value)} placeholder="上限" className={`${inputCls} font-mono`} />
              </div>
            </label>
          </div>

          <div className="flex justify-end mt-4">
            <button onClick={resetFilters} className="text-xs text-slate-400 hover:text-slate-100 transition-colors">条件をクリア</button>
          </div>
        </section>

        {/* ⚠️ 財務指標に関する注記 */}
        <div className="mb-6 p-3 bg-blue-950/30 border border-blue-900/50 rounded-xl text-xs text-slate-400 leading-relaxed">
          💡 <strong>お知らせ:</strong> 株価・出来高・52週高安・騰落率は Yahoo の実データで絞り込めます（<Link href="/prices" className="text-emerald-400 underline">/prices</Link> の「現在値を自動取得」で更新）。PBR・PER・配当利回りなどの財務指標は、次フェーズの J-Quants 統合で追加予定です。
        </div>

        {/* 📊 結果テーブル */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          {loading ? (
            <p className="py-20 text-center text-slate-500">東証銘柄データベースを照合中...</p>
          ) : error ? (
            <p className="py-20 text-center text-rose-400 text-sm">エラー：{error}</p>
          ) : filteredStocks.length === 0 ? (
            <p className="py-20 text-center text-slate-500">条件に一致する銘柄がありません。/prices で「現在値を自動取得」を実行して指標を取得してください。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 text-xs font-semibold">
                    <th className="p-4 w-20">コード</th>
                    <th className="p-4">銘柄名</th>
                    <th className="p-4">業種</th>
                    <th className="p-4 text-right">現在値</th>
                    <th className="p-4 text-right">当日</th>
                    <th className="p-4 text-right">52週位置</th>
                    <th className="p-4 text-right">出来高</th>
                    <th className="p-4 text-center w-44">アクション</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 font-medium">
                  {displayStocks.map((stock) => (
                    <tr key={stock.code} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-4 font-mono text-slate-400">{stock.code}</td>
                      <td className="p-4 text-slate-100 font-bold">{stock.name}</td>
                      <td className="p-4 text-slate-400 text-xs">
                        <span className="bg-slate-800 px-2 py-1 rounded-md border border-slate-700/60">{stock.sector}</span>
                      </td>
                      <td className="p-4 text-right font-mono text-emerald-400 font-bold">
                        ¥{(stock.price ?? 0).toLocaleString()}
                      </td>
                      <td className="p-4 text-right font-mono">
                        {stock.changePct == null ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span className={stock.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {stock.changePct >= 0 ? "+" : ""}{stock.changePct.toFixed(2)}%
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-300">
                        {stock.positionPct == null ? <span className="text-slate-600">—</span> : `${stock.positionPct.toFixed(0)}%`}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-400 text-xs">
                        {stock.volume == null ? <span className="text-slate-600">—</span> : stock.volume.toLocaleString()}
                      </td>
                      <td className="p-4 flex items-center justify-center gap-2">
                        <Link href={`/analysis?code=${stock.code}`}
                          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2.5 py-1.5 text-xs transition-colors">
                          チャート
                        </Link>
                        <button onClick={() => addToWatchlist(stock)}
                          className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold px-2.5 py-1.5 text-xs transition-colors">
                          ＋ 監視
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredStocks.length > 300 && (
                <div className="p-4 text-center text-xs text-slate-500 border-t border-slate-800 bg-slate-950/20">
                  ⚠️ 描画軽量化のため、該当 {filteredStocks.length} 件のうち最初の 300 件を表示しています。条件を絞り込んでください。
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 focus:outline-none px-3 py-1.5 text-slate-100 placeholder-slate-600 text-sm";