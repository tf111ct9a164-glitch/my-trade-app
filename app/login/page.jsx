"use client";

// =============================================================================
//  ログイン / 新規登録画面   app/login/page.jsx
//  Supabase Auth（メール＋パスワード）
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LogIn, UserPlus } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // すでにログイン済みならダッシュボードへ
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router]);

  async function handleSubmit() {
    setError("");
    setMessage("");
    if (!email || !password) return setError("メールアドレスとパスワードを入力してください");

    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setError(error.message);
      router.replace("/dashboard");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) return setError(error.message);
      if (data.session) {
        // メール確認OFFの場合は即ログイン状態になる
        router.replace("/dashboard");
      } else {
        // メール確認ONの場合（Supabaseの初期設定）
        setMessage("確認メールを送信しました。メール内のリンクから認証後にログインしてください。");
      }
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-6"
      style={{
        fontFamily: "'Manrope', system-ui, sans-serif",
        backgroundImage:
          "radial-gradient(700px 500px at 80% -10%, rgba(16,185,129,0.12), transparent), radial-gradient(600px 400px at 10% 110%, rgba(56,189,248,0.08), transparent)",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');`}</style>

      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <p className="text-emerald-400 text-xs font-semibold tracking-widest uppercase mb-1">
            Portfolio
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {mode === "login" ? "ログイン" : "アカウント作成"}
          </h1>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <label className="block mb-4">
            <span className="block text-xs text-slate-400 mb-1.5">メールアドレス</span>
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="block mb-5">
            <span className="block text-xs text-slate-400 mb-1.5">パスワード</span>
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="6文字以上"
            />
          </label>

          {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}
          {message && <p className="text-emerald-400 text-sm mb-4">{message}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 transition-colors"
          >
            {mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
            {loading ? "処理中..." : mode === "login" ? "ログイン" : "登録する"}
          </button>
        </div>

        <p className="text-center text-sm text-slate-400 mt-5">
          {mode === "login" ? "アカウントをお持ちでない場合は " : "すでにアカウントをお持ちの場合は "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
              setMessage("");
            }}
            className="text-emerald-400 font-semibold hover:text-emerald-300"
          >
            {mode === "login" ? "新規登録" : "ログイン"}
          </button>
        </p>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 focus:outline-none px-3 py-2 text-slate-100 placeholder-slate-600";
