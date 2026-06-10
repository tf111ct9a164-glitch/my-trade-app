-- ============================================================================
--  株式取引管理アプリ  Supabase スキーマ
--  Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1) stock_prices : 各銘柄の最新株価（手動更新 → 後でAPI更新に切替可能）
--     株価は「全ユーザー共通の事実」なので code を主キーにした共有テーブル。
-- ----------------------------------------------------------------------------
create table if not exists public.stock_prices (
  code          text        primary key,                 -- 銘柄コード（例: '7203'）
  name          text        not null,                     -- 銘柄名
  current_price numeric      not null default 0 check (current_price >= 0), -- 現在株価
  updated_at    timestamptz not null default now()        -- 最終更新日時
);

-- ----------------------------------------------------------------------------
--  2) trades : 取引履歴（ユーザーごとの記録）
-- ----------------------------------------------------------------------------
create table if not exists public.trades (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        default auth.uid()              -- 認証導入後に自動で入る
                          references auth.users(id) on delete cascade,
  code        text        not null,                       -- 銘柄コード
  name        text,                                       -- 銘柄名（任意・入力時の控え）
  side        text        not null default 'buy'
                          check (side in ('buy', 'sell')), -- 買い / 売り
  trade_date  date        not null default current_date,  -- 売買日
  shares      numeric      not null check (shares > 0),     -- 株数
  price       numeric      not null check (price >= 0),     -- 約定単価
  fee         numeric      not null default 0 check (fee >= 0), -- 手数料
  created_at  timestamptz not null default now()
);

-- 検索を速くするためのインデックス
create index if not exists idx_trades_code on public.trades (code);
create index if not exists idx_trades_user_date on public.trades (user_id, trade_date desc);

-- ----------------------------------------------------------------------------
--  3) updated_at を自動更新するトリガー（stock_prices を UPDATE するたびに now()）
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_stock_prices_updated_at on public.stock_prices;
create trigger trg_stock_prices_updated_at
  before update on public.stock_prices
  for each row execute function public.set_updated_at();


-- ============================================================================
--  RLS（行レベルセキュリティ）
--  ※ 認証(Supabase Auth)を入れる「前」と「後」で対応が変わります。下記参照。
-- ============================================================================

-- 【A】 認証導入後（本番向け・推奨）------------------------------------------
--   ユーザーは自分の trades 行だけ読み書きでき、株価は全員が参照／更新可能。
--   ↓ Step 3 で認証を入れたら、このブロックのコメントを外して実行してください。
--
-- alter table public.trades        enable row level security;
-- alter table public.stock_prices  enable row level security;
--
-- create policy "own trades"          on public.trades
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- create policy "read prices"         on public.stock_prices
--   for select using (true);
-- create policy "write prices (auth)" on public.stock_prices
--   for all to authenticated using (true) with check (true);


-- 【B】 認証導入前（ローカル開発・お試し用）----------------------------------
--   まだログイン機能が無い段階では、RLS を有効にすると anon キーからの
--   読み書きが全てブロックされます。動作確認のため一時的に RLS を無効化します。
--   ※ 公開デプロイ前に必ず【A】へ移行してください（無効のままだと誰でも全データ閲覧可）。
alter table public.trades        disable row level security;
alter table public.stock_prices  disable row level security;
