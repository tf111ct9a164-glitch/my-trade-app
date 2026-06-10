// app/api/update-prices/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // 既存のクライアント定義に合わせる
import { CONSTITUENTS } from "@/mock/constituents";

const BATCH_SIZE = 50;

// Yahoo Financeから終値を擬似、または軽量エンドポイント等で取得する関数
async function fetchLatestClose(code) {
  try {
    // 既存の candles API 等で使っている Yahoo の軽量取得ロジックに準拠
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.T?interval=1d&range=1d`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json.chart?.result?.[0]?.meta;
    return meta?.regularMarketPrice ? { close: meta.regularMarketPrice } : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    // 1. パラメータの offset を確認。無ければDBから前回のカーソル(進捗)を読み込む
    const { searchParams } = new URL(request.url);
    let offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : null;

    if (offset === null) {
      const { data: curData } = await supabase
        .from("stock_prices")
        .select("current_price")
        .eq("ticker", "__cursor__")
        .single();
      offset = curData ? Number(curData.current_price) : 0;
    }

    // 巡回範囲が全銘柄数を超えていたら0番に戻す
    if (offset >= CONSTITUENTS.length) {
      offset = 0;
    }

    // 2. 今回処理する50件を切り出す
    const slice = CONSTITUENTS.slice(offset, offset + BATCH_SIZE);
    const results = [];

    // 3. 50件を安全に（250msのウェイトを入れつつ）巡回取得＆Upsert
    for (const { code } of slice) {
      try {
        const latest = await fetchLatestClose(code);
        if (latest && latest.close) {
          await supabase.from("stock_prices").upsert(
            { 
              ticker: code, 
              current_price: latest.close, 
              updated_at: new Date().toISOString() 
            }, 
            { onConflict: "ticker" }
          );
          results.push({ code, status: "success", price: latest.close });
        } else {
          results.push({ code, status: "failed", reason: "No price fetched" });
        }
      } catch (e) {
        results.push({ code, status: "error", error: e.message });
      }
      // Yahooからのブロックを防ぐための250msウェイト
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // 4. 次回用のカーソル位置を計算してDBの「__cursor__」に保存
    const nextOffset = offset + BATCH_SIZE;
    const isDone = nextOffset >= CONSTITUENTS.length;
    const saveOffset = isDone ? 0 : nextOffset;

    await supabase.from("stock_prices").upsert(
      { 
        ticker: "__cursor__", 
        current_price: saveOffset, 
        updated_at: new Date().toISOString() 
      }, 
      { onConflict: "ticker" }
    );

    return NextResponse.json({
      success: true,
      done: isDone,
      currentOffset: offset,
      nextOffset: saveOffset,
      processedCount: results.length,
      details: results
    });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}