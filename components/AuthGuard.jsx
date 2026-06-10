"use client";

// =============================================================================
//  components/AuthGuard.jsx（モバイル堅牢化版）
//  - onAuthStateChange を主軸にして判定（getSession の固まり対策）
//  - 保険のタイムアウトを入れ、いつまでも「確認中...」で止まらないようにする
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthGuard({ children }) {
  const router = useRouter();
  const [status, setStatus] = useState("loading"); // "loading" | "authed"

  useEffect(() => {
    let settled = false;

    // 読み込み時に現在のセッションを必ず通知してくれる（INITIAL_SESSION）。
    // getSession() より固まりにくいのでこちらを主軸にする。
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        settled = true;
        setStatus("authed");
      } else {
        // セッション無し → ログインへ
        router.replace("/login");
      }
    });

    // 保険：5秒以内に判定できなければログイン画面へ（永久フリーズ防止）
    const timer = setTimeout(() => {
      if (!settled) router.replace("/login");
    }, 5000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-500">
        確認中...
      </div>
    );
  }

  return children;
}
