// app/api/screen/route.js  【テクニカル指標つき版】
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { CONSTITUENTS } from "@/mock/constituents";

export async function GET(request) {
  try {
    // 1. DBから保存済みの株価＋指標を全件引っ張る
    const { data: prices, error } = await supabase
      .from("stock_prices")
      .select("ticker, current_price, updated_at, week52_high, week52_low, volume, change_pct");

    if (error) throw error;

    // 2. 超高速検索のためにMap化（特殊行 __cursor__ は除外）
    const priceMap = new Map();
    (prices ?? []).forEach((p) => {
      if (p.ticker !== "__cursor__") {
        priceMap.set(p.ticker, {
          price: p.current_price,
          updatedAt: p.updated_at,
          week52High: p.week52_high != null ? Number(p.week52_high) : null,
          week52Low: p.week52_low != null ? Number(p.week52_low) : null,
          volume: p.volume != null ? Number(p.volume) : null,
          changePct: p.change_pct != null ? Number(p.change_pct) : null,
        });
      }
    });

    // 3. 静的な全銘柄リスト（CONSTITUENTS）に、DBから見つかった株価・指標をJOINマージ
    const stocks = CONSTITUENTS.map((s) => {
      const d = priceMap.get(s.code);
      return {
        code: s.code,
        name: s.name,
        sector: s.sector,
        price: d ? d.price : null,
        updatedAt: d ? d.updatedAt : null,
        week52High: d ? d.week52High : null,
        week52Low: d ? d.week52Low : null,
        volume: d ? d.volume : null,
        changePct: d ? d.changePct : null,
      };
    });

    // 全銘柄総数と、そのうち「株価が1度でも取得できている銘柄数」をカウント
    const totalCount = CONSTITUENTS.length;
    const activeCount = [...priceMap.keys()].filter((code) =>
      CONSTITUENTS.some((c) => c.code === code)
    ).length;

    return NextResponse.json({
      success: true,
      totalCount,
      activeCount,
      stocks,
    });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}