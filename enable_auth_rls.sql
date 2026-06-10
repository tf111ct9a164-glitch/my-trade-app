-- ============================================================================
--  認証導入後のセットアップ SQL
--   1) daily_assets（資産推移スナップショット）テーブルの作成
--   2) 全テーブルの RLS（行レベルセキュリティ）有効化とポリシー設定
--  Supabase ダッシュボード → SQL Editor で実行してください。
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1) daily_assets : その日時点の総資産額を記録（資産推移グラフ用）
--     unique(user_id, snapshot_date) で「1ユーザー・1日1レコード」を保証。
--     同じ日に再記録した場合は upsert で上書きされる。
-- ----------------------------------------------------------------------------
create table if not exists public.daily_assets (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null default auth.uid()
                             references auth.users(id) on delete cascade,
  snapshot_date  date        not null default current_date, -- 記録日
  total_value    numeric      not null,                       -- 評価額合計（総資産）
  total_cost     numeric,                                     -- 投資元本（任意）
  unrealized_pnl numeric,                                     -- 含み損益（任意）
  created_at     timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists idx_daily_assets_user_date
  on public.daily_assets (user_id, snapshot_date);


-- ----------------------------------------------------------------------------
--  2) RLS の有効化とポリシー
--     trades / daily_assets … ユーザーは自分の行だけ読み書き可能
--     stock_prices          … 株価は全員共通の事実なので、ログイン済みなら閲覧・更新可能
-- ----------------------------------------------------------------------------
alter table public.trades        enable row level security;
alter table public.daily_assets  enable row level security;
alter table public.stock_prices  enable row level security;

-- trades : 自分の取引のみ
drop policy if exists "own trades" on public.trades;
create policy "own trades" on public.trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- daily_assets : 自分のスナップショットのみ
drop policy if exists "own daily_assets" on public.daily_assets;
create policy "own daily_assets" on public.daily_assets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- stock_prices : ログイン済みユーザーは閲覧・更新可能（共有マスタ）
drop policy if exists "read prices" on public.stock_prices;
create policy "read prices" on public.stock_prices
  for select to authenticated using (true);

drop policy if exists "write prices" on public.stock_prices;
create policy "write prices" on public.stock_prices
  for all to authenticated using (true) with check (true);


-- ----------------------------------------------------------------------------
--  ⚠ 注意: 認証導入「前」に登録したテスト用の trades は user_id が NULL です。
--     RLS 有効化後はどのユーザーからも見えなくなります。
--     → Table Editor から古いテスト行を削除し、ログイン後に入力し直すのが簡単です。
-- ----------------------------------------------------------------------------
