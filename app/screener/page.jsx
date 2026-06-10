"use client";

// =============================================================================
//  東証全銘柄対応・爆速スクリーニング画面   app/screener/page.jsx
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

  // 検索・フィルター用の状態（無料API制約のため株価・業種中心）
  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

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

  // 2. 動的に全データから「存在する業種」のリストを抽出（プルダウン用）
  const sectors = useMemo(() => {
    const list = allStocks.map((s) => s.sector).filter(Boolean);
    return [...new Set(list)].sort();
  }, [allStocks]);

  // 3. クライアント側で爆速条件フィルタリング
  const filteredStocks = useMemo(() => {
    return allStocks.filter((s) => {
      // まだ一度も株価バッチが回っていない銘柄は除外
      if (s.price === null) return false;

      // コードまたは名前での部分一致
      if (search && !s.code.includes(search) && !s.name.includes(search)) return false;
      // 業種フィルタ
      if (selectedSector && s.sector !== selectedSector) return false;
      // 最低株価
      if (minPrice && s.price < Number(minPrice)) return false;
      // 最高株価
      if (maxPrice && s.price > Number(maxPrice)) return false;

      return true;
    });
  }, [allStocks, search, selectedSector, minPrice, maxPrice]);

  // 4. お気に入り（監視追加）ボタンの処理
  async function addToWatchlist(stock) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 既存の「trades」テーブル等のお気に入り保存ロジックに合流（ここでは擬似・または既存流用）
      const { error: err } = await supabase.from("trades").upsert({
        user_id: session.user.id,
        code: stock.code,
        name: stock.name,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id,code" });

      if (err) throw err;
      
      setWatchActionMsg(`🟢 ${stock.name} (${stock.code}) を監視リストに追加しました！`);
      setTimeout(() => setWatchActionMsg(""), 3000);
    } catch (e) {
      setWatchActionMsg(`❌ 追加失敗: ${e.message}`);
      setTimeout(() => setWatchActionMsg(""), 3000);
    }
  }

  // 画面が重くなるのを防ぐため、表示件数を最大300件に制限
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
            株価取得済み: <span className="text-emerald-400 font-bold">{progress.active}</span> / 全 {progress.total} 銘柄
          </div>
        </header>

        {watchActionMsg && (
          <div className="mb-4 p-3 bg-slate-900 border border-emerald-500/30 text-emerald-400 text-sm font-semibold rounded-xl animate-fade-in">
            {watchActionMsg}
          </div>
        )}

        {/* 🛠️ フィルターパネル */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 md:p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <span className="block text-xs text-slate-400 mb-1.5">コード または 銘柄名</span>
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="例: 5803" 
              className={inputCls} 
            />
          </label>

          <label className="block">
            <span className="block text-xs text-slate-400 mb-1.5">業種・セクター</span>
            <select 
              value={selectedSector} 
              onChange={(e) => setSelectedSector(e.target.value)} 
              className={inputCls}
            >
              <option value="">すべての業種</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2 lg:col-span-2">
            <span className="block text-xs text-slate-400 mb-1.5">株価レンジ (円)</span>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                value={minPrice} 
                onChange={(e) => setMinPrice(e.target.value)} 
                placeholder="下限なし" 
                className={inputCls} 
              />
              <span className="text-slate-600">〜</span>
              <input 
                type="number" 
                value={maxPrice} 
                onChange={(e) => setMaxPrice(e.target.value)} 
                placeholder="上限なし" 
                className={inputCls} 
              />
            </div>
          </label>
        </section>

        {/* ⚠️ 財務指標に関する注意書き注記 */}
        <div className="mb-6 p-3 bg-blue-950/30 border border-blue-900/50 rounded-xl text-xs text-slate-400 leading-relaxed">
          💡 <strong>お知らせ:</strong> 現在、無料のリアルタイム株価API（終値データ）をベースに巡回しているため、PBR・PER・配当利回りでの全件一括フィルタは制限されています。これらの詳細な財務分析機能は、次のフェーズで「J-Quants API（財務データ）」を統合した際に完全有効化されます。
        </div>

        {/* 📊 結果テーブル */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          {loading ? (
            <p className="py-20 text-center text-slate-500">東証銘柄データベースを照合中...</p>
          ) : error ? (
            <p className="py-20 text-center text-rose-400 text-sm">エラー：{error}</p>
          ) : filteredStocks.length === 0 ? (
            <p className="py-20 text-center text-slate-500">条件に一致する「株価取得済み」の銘柄がありません。裏のバッチ処理をお待ちください。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 text-xs font-semibold">
                    <th className="p-4 w-24">コード</th>
                    <th className="p-4">銘柄名</th>
                    <th className="p-4">業種</th>
                    <th className="p-4 text-right">現在値 (終値)</th>
                    <th className="p-4 text-center w-48">アクション</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 font-medium">
                  {displayStocks.map((stock) => (
                    <tr key={stock.code} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-4 font-mono text-slate-400">{stock.code}</td>
                      <td className="p-4 text-slate-100 font-bold">{stock.name}</td>
                      <td className="p-4 text-slate-400 text-xs">
                        <span className="bg-slate-800 px-2 py-1 rounded-md border border-slate-700/60">
                          {stock.sector}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-emerald-400 font-bold">
                        ¥{(stock.price ?? 0).toLocaleString()}
                      </td>
                      <td className="p-4 flex items-center justify-center gap-2">
                        <Link 
                          href={`/analysis?code=${stock.code}`}
                          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2.5 py-1.5 text-xs transition-colors"
                        >
                          チャート分析
                        </Link>
                        <button
                          onClick={() => addToWatchlist(stock)}
                          className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold px-2.5 py-1.5 text-xs transition-colors"
                        >
                          ＋ 監視追加
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredStocks.length > 300 && (
                <div className="p-4 text-center text-xs text-slate-500 border-t border-slate-800 bg-slate-950/20">
                  ⚠️ 描画軽量化のため、条件に該当する {filteredStocks.length} 件のうち最初の 300 件を表示しています。より細かく絞り込むには条件を入力してください。
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