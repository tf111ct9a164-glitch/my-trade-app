"use client";

// =============================================================================
//  components/NavBar.jsx
//  全ページ共通の上部ナビ。app/layout.jsx に置いて全画面で共有する。
//  - 5リンク（ダッシュボード / 保有・監視株価 / スクリーニング / 売買ノート / 銘柄分析）
//  - 現在地をハイライト
//  - ログアウトボタン
//  - スマホはハンバーガーメニューで開閉
//  - /login では非表示
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Wallet,
  Filter,
  BookOpen,
  LineChart,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/prices", label: "保有・監視株価", icon: Wallet },
  { href: "/screener", label: "スクリーニング", icon: Filter },
  { href: "/journal", label: "売買ノート", icon: BookOpen },
  { href: "/analysis", label: "銘柄分析", icon: LineChart },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false); // スマホメニューの開閉

  // ログイン画面ではナビを出さない
  if (pathname === "/login") return null;

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900 bg-opacity-80"
      style={{ fontFamily: "'Manrope', system-ui, sans-serif", backdropFilter: "blur(8px)" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');`}</style>

      <div className="mx-auto max-w-6xl px-4 md:px-6 h-14 flex items-center justify-between gap-4">
        {/* ブランド */}
        <Link href="/dashboard" className="font-extrabold tracking-tight text-slate-100 shrink-0">
          <span className="text-emerald-400">●</span> Portfolio
        </Link>

        {/* PC用：横並びリンク */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                isActive(href)
                  ? "bg-emerald-500 bg-opacity-15 text-emerald-400"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </div>

        {/* 右側：ログアウト（常時）＋ スマホ用ハンバーガー */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">ログアウト</span>
          </button>

          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-slate-800"
            aria-label="メニュー"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* スマホ用：開閉するメニュー */}
      {open && (
        <div className="md:hidden border-t border-slate-800 px-4 py-3 space-y-1">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                isActive(href)
                  ? "bg-emerald-500 bg-opacity-15 text-emerald-400"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
