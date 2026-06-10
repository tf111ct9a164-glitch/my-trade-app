// =============================================================================
//  lib/supabaseAdmin.js  ※ サーバー専用（絶対にブラウザ/クライアントから import しない）
//  service_role キーを使うため RLS をバイパスできる。バッチ更新用。
//  このファイルを "use client" のコンポーネントから import すると鍵が漏れるので厳禁。
// =============================================================================

import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // サーバー専用の秘密キー
  { auth: { persistSession: false, autoRefreshToken: false } }
);