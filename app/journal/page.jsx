"use client";

// =============================================================================
//  売買ノート（投資日記）  app/journal/page.jsx  【案B：trades 同期版＋過去ぶん再同期】
//
//  - 保存／編集時に、対応する取引を trades へ journal_id 付きで同期（新規入力ぶん）。
//  - 「保有に再同期」ボタン：trade_journal の全件を trades に一括同期（過去ぶんの取り込み）。
//    ※ デプロイ前に入力した過去ノートは trades に無いため、一度押して取り込む。
//  - 削除時は trades 側の該当行（journal_id 一致）も一緒に削除。
//
//  ◆事前に一度だけ Supabase SQL Editor で実行しておくこと:
//      alter table trades add column if not exists journal_id uuid;
//      create index if not exists trades_journal_id_idx on trades(journal_id);
// =============================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { findStock } from "@/mock/data";
import { Plus, Trash2, Edit2, X, RefreshCw } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";

const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");

// ISO文字列 → ローカル日付 "YYYY-MM-DD"（/analysis のマーカー吸着と日付をそろえる）
const toLocalDate = (iso) => {
  const dt = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

export default function JournalPage() {
  return (
    <AuthGuard>
      <JournalContent />
    </AuthGuard>
  );
}

function JournalContent() {
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // フォーム用状態
  const [editingId, setEditingId] = useState(null);
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryAt, setEntryAt] = useState("");
  const [entryReason, setEntryReason] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [exitAt, setExitAt] = useState("");
  const [exitReason, setExitReason] = useState("");

  // 日記一覧の読み込み
  async function loadJournals() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("trade_journal")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setJournals(data || []);
    } catch (e) {
      console.error(e);
      setError(e.message || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJournals();
  }, []);

  // 新規・編集のポップアップを開く
  function openModal(item = null) {
    setError("");
    if (item) {
      setEditingId(item.id);
      setTicker(item.ticker);
      setQuantity(item.quantity.toString());
      setEntryPrice(item.entry_price.toString());
      setEntryAt(item.entry_at ? item.entry_at.substring(0, 16) : "");
      setEntryReason(item.entry_reason || "");
      setExitPrice(item.exit_price ? item.exit_price.toString() : "");
      setExitAt(item.exit_at ? item.exit_at.substring(0, 16) : "");
      setExitReason(item.exit_reason || "");
    } else {
      setEditingId(null);
      setTicker("");
      setQuantity("");
      setEntryPrice("");
      setEntryAt(new Date().toISOString().substring(0, 16));
      setEntryReason("");
      setExitPrice("");
      setExitAt("");
      setExitReason("");
    }
    setIsOpen(true);
  }

  // 🔗 案B：この journal 由来の取引を trades に同期する（消してから入れ直す＝冪等）
  async function syncTrades(journalId, p) {
    const { error: delErr } = await supabase.from("trades").delete().eq("journal_id", journalId);
    if (delErr) throw delErr;

    const name = findStock(p.ticker)?.name || null;
    const rows = [];

    // エントリー → 買い
    rows.push({
      journal_id: journalId,
      code: p.ticker,
      name,
      side: "buy",
      shares: p.quantity,
      price: p.entry_price,
      fee: 0,
      trade_date: toLocalDate(p.entry_at),
    });

    // エグジット価格があれば → 売り
    if (p.exit_price != null) {
      rows.push({
        journal_id: journalId,
        code: p.ticker,
        name,
        side: "sell",
        shares: p.quantity,
        price: p.exit_price,
        fee: 0,
        trade_date: toLocalDate(p.exit_at || p.entry_at),
      });
    }

    const { error: insErr } = await supabase.from("trades").insert(rows);
    if (insErr) throw insErr;
  }

  // 🔁 過去ぶんを含む全ノートを trades に一括再同期（取り込み）
  async function resyncAll() {
    setResyncing(true);
    setError("");
    setNotice("");
    try {
      const { data, error } = await supabase.from("trade_journal").select("*");
      if (error) throw error;

      let n = 0;
      for (const j of data ?? []) {
        await syncTrades(j.id, {
          ticker: j.ticker,
          quantity: j.quantity,
          entry_price: j.entry_price,
          entry_at: j.entry_at,
          exit_price: j.exit_price,
          exit_at: j.exit_at,
        });
        n++;
      }
      setNotice(`${n} 件のノートを保有(trades)に再同期しました。ダッシュボードに反映されます。`);
    } catch (e) {
      console.error(e);
      setError(
        (e.message || "再同期に失敗しました") +
        "（trades に journal_id 列が必要です。未実行ならマイグレーションSQLを流してください）"
      );
    } finally {
      setResyncing(false);
    }
  }

  // 保存処理（trade_journal → trades の順で同期）
  async function handleSave(e) {
    e.preventDefault();
    setError("");

    if (!ticker.trim()) { setError("銘柄コードを入力してください"); return; }
    if (!(Number(quantity) > 0)) { setError("株数は1以上で入力してください"); return; }
    if (!(Number(entryPrice) >= 0)) { setError("エントリー価格を正しく入力してください"); return; }

    const payload = {
      ticker: ticker.trim(),
      quantity: Number(quantity),
      entry_price: Number(entryPrice),
      entry_at: entryAt ? new Date(entryAt).toISOString() : null,
      entry_reason: entryReason,
      exit_price: exitPrice ? Number(exitPrice) : null,
      exit_at: exitAt ? new Date(exitAt).toISOString() : null,
      exit_reason: exitReason,
    };

    setSaving(true);
    try {
      let journalId = editingId;

      if (editingId) {
        const { error } = await supabase.from("trade_journal").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("trade_journal")
          .insert([payload])
          .select("id")
          .single();
        if (error) throw error;
        journalId = data.id;
      }

      await syncTrades(journalId, payload);

      setSaving(false);
      setIsOpen(false);
      loadJournals();
    } catch (err) {
      console.error(err);
      setSaving(false);
      setError(
        (err.message || "保存に失敗しました") +
        "（trades に journal_id 列が必要です。未実行ならマイグレーションSQLを流してください）"
      );
    }
  }

  // 削除処理（trades 側の該当行も一緒に消す）
  async function handleDelete(id) {
    if (!confirm("この売買記録を削除しますか？\n（ダッシュボードの保有・取引履歴からも削除されます）")) return;
    setError("");
    try {
      const { error: te } = await supabase.from("trades").delete().eq("journal_id", id);
      if (te) throw te;
      const { error: je } = await supabase.from("trade_journal").delete().eq("id", id);
      if (je) throw je;
      loadJournals();
    } catch (err) {
      console.error(err);
      setError(err.message || "削除に失敗しました");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto">

        <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
          <div>
            <p className="text-emerald-400 text-xs font-semibold tracking-widest uppercase mb-1">Journal</p>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">売買ノート（投資日記）</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resyncAll}
              disabled={resyncing}
              title="過去ぶんを含む全ノートを保有(trades)に取り込みます"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold px-3 py-2.5 text-sm transition-all"
            >
              <RefreshCw size={15} className={resyncing ? "animate-spin" : ""} />
              {resyncing ? "再同期中…" : "保有に再同期"}
            </button>
            <button
              onClick={() => openModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 text-sm transition-all"
            >
              <Plus size={16} />
              新規記録
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          ※ ここに記録すると、ダッシュボードの保有銘柄・損益にも自動で反映されます（エグジット未入力＝保有中）。過去に入力したノートが保有に出ていない場合は「保有に再同期」を一度押してください。
        </p>

        {notice && <p className="text-emerald-400 text-sm mb-4 bg-emerald-500/10 border border-emerald-800 rounded-xl px-4 py-3">{notice}</p>}
        {error && <p className="text-rose-400 text-sm mb-4 bg-rose-500/10 border border-rose-800 rounded-xl px-4 py-3">{error}</p>}

        {/* 記録カード一覧 */}
        {loading ? (
          <p className="text-center text-slate-500 py-10">読み込み中...</p>
        ) : journals.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            まだ売買記録がありません。「新規記録」からエントリーの振り返りを書き残しましょう！
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {journals.map((j) => {
              const stockName = findStock(j.ticker)?.name || j.ticker;
              const isSettled = j.exit_price != null;

              const profit = isSettled ? (j.exit_price - j.entry_price) * j.quantity : 0;
              const profitRate = isSettled ? ((j.exit_price - j.entry_price) / j.entry_price) * 100 : 0;

              return (
                <div key={j.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono font-bold text-emerald-400 text-sm bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{j.ticker}</span>
                      <h3 className="font-bold text-base text-slate-100">{stockName}</h3>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSettled ? "bg-slate-800 text-slate-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        {isSettled ? "決済済み" : "保有中"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mt-3 text-xs border-t border-slate-800/50 pt-3">
                      <div>
                        <span className="text-slate-500 block">株数</span>
                        <span className="font-mono text-slate-200">{j.quantity.toLocaleString()} 株</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">エントリー価格</span>
                        <span className="font-mono text-slate-200">{yen(j.entry_price)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">エグジット価格</span>
                        <span className="font-mono text-slate-200">{isSettled ? yen(j.exit_price) : "---"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">損益結果</span>
                        {isSettled ? (
                          <span className={`font-mono font-bold ${profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {profit >= 0 ? "+" : ""}{yen(Math.round(profit))} ({profitRate.toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-slate-500">---</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      {j.entry_reason && (
                        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40">
                          <span className="text-emerald-400 font-bold block mb-1">📥 エントリー理由 ({j.entry_at ? new Date(j.entry_at).toLocaleDateString() : "未指定"})</span>
                          <p className="text-slate-300 whitespace-pre-wrap">{j.entry_reason}</p>
                        </div>
                      )}
                      {isSettled && j.exit_reason && (
                        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40">
                          <span className="text-amber-400 font-bold block mb-1">📤 エグジット理由 ({j.exit_at ? new Date(j.exit_at).toLocaleDateString() : "未指定"})</span>
                          <p className="text-slate-300 whitespace-pre-wrap">{j.exit_reason}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-end gap-2 border-t md:border-t-0 border-slate-800 pt-3 md:pt-0">
                    <button onClick={() => openModal(j)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors" title="編集">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(j.id)} className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 transition-colors" title="削除">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 📥 入力・編集モーダル */}
        {isOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-850">
                <h2 className="font-bold text-slate-100">{editingId ? "売買記録を編集" : "新しい売買を記録"}</h2>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-100 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <div className="flex justify-between items-center mb-1">
                      <span className="block text-xs text-slate-400">銘柄コード</span>
                      {ticker.trim().length >= 4 && findStock(ticker.trim()) && (
                        <span className="text-xs text-emerald-400 font-bold animate-pulse">➔ {findStock(ticker.trim()).name}</span>
                      )}
                    </div>
                    <input type="text" required className={inputCls} placeholder="例: 8058" value={ticker} onChange={(e) => setTicker(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-400 mb-1">株数</span>
                    <input type="number" required className={inputCls} placeholder="100" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </label>
                </div>

                <div className="border-t border-slate-800/60 pt-3">
                  <h4 className="text-xs font-bold text-emerald-400 mb-2">📥 エントリー（買い）</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-xs text-slate-400 mb-1">エントリー価格</span>
                      <input type="number" required className={inputCls} placeholder="4979" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-slate-400 mb-1">エントリー日時</span>
                      <input type="datetime-local" className={inputCls} value={entryAt} onChange={(e) => setEntryAt(e.target.value)} />
                    </label>
                  </div>
                  <label className="block mt-2">
                    <span className="block text-xs text-slate-400 mb-1">エントリー根拠・メモ</span>
                    <textarea className={inputCls} rows={2} placeholder="移動平均線が反発したため、根拠を持ってエントリー" value={entryReason} onChange={(e) => setEntryReason(e.target.value)} />
                  </label>
                </div>

                <div className="border-t border-slate-800/60 pt-3">
                  <h4 className="text-xs font-bold text-amber-400 mb-2">📤 エグジット（売り・任意）</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-xs text-slate-400 mb-1">エグジット価格</span>
                      <input type="number" className={inputCls} placeholder="5200" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-slate-400 mb-1">エグジット日時</span>
                      <input type="datetime-local" className={inputCls} value={exitAt} onChange={(e) => setExitAt(e.target.value)} />
                    </label>
                  </div>
                  <label className="block mt-2">
                    <span className="block text-xs text-slate-400 mb-1">エグジット根拠・反省メモ</span>
                    <textarea className={inputCls} rows={2} placeholder="目標ラインに達したため利確。トレードルール通り。" value={exitReason} onChange={(e) => setExitReason(e.target.value)} />
                  </label>
                </div>

                {error && <p className="text-rose-400 text-xs">{error}</p>}

                <div className="border-t border-slate-800 pt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setIsOpen(false)} className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2 text-sm transition-colors">
                    キャンセル
                  </button>
                  <button type="submit" disabled={saving} className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2 text-sm transition-colors">
                    {saving ? "保存中..." : "記録を保存"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 focus:outline-none px-3 py-2 text-slate-100 text-sm placeholder-slate-600 font-sans";