// =============================================================================
//  app/api/candles/route.js
//  GET /api/candles?code=8058&range=1y
//  Yahoo Finance から四本値を取得して Lightweight Charts 形式で返す。
//  ※ Yahoo はブラウザから直接叩けない（CORS）ので、必ずこのサーバー経由で取得する。
// =============================================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchDailyBars } from "@/lib/stockApi";

export const dynamic = "force-dynamic";

// ログイン済みユーザーのみ許可（オープンなYahooプロキシ化を防ぐ）
async function requireUser(request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await supabaseAdmin.auth.getUser(token);
  return !!data?.user;
}

export async function GET(request) {
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const range = searchParams.get("range") || "1y";
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  try {
    const { bars, name } = await fetchDailyBars(code, range);
    return NextResponse.json({ code, range, name, bars });
  } catch (e) {
    return NextResponse.json({ error: String(e.message ?? e) }, { status: 502 });
  }
}