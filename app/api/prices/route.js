// =============================================================================
//  app/api/prices/route.js  【テクニカル指標つき版】
//  Yahoo Finance から日本株の現在値＋52週高安・出来高・当日騰落率をまとめて取得。
//
//  - GET /api/prices?codes=7203,6758,9984
//  - 各コードに ".T" を付けて chart API を range=1y で叩き、実際の四本値から算出
//  - サーバー側で実行（ブラウザから直接 Yahoo は CORS で叩けない）
//
//  返り値:
//    {
//      prices:  { "7203": 2890, ... },              // 現在値（後方互換のため従来どおり）
//      names:   { "7203": "トヨタ自動車", ... },
//      metrics: { "7203": { week52High, week52Low, volume, changePct }, ... },
//      errors:  { "9999": "Yahoo 404", ... },
//      asOf:    "2026-06-16T..."
//    }
// =============================================================================

export const dynamic = "force-dynamic"; // 常に最新を取りに行く（キャッシュさせない）

// コード整形：全角空白や ".T" を除去（285A のような英数字コードも維持）
function normCode(v) {
  if (!v) return "";
  let s = String(v).trim().toUpperCase();
  if (s.endsWith(".T")) s = s.slice(0, -2);
  return s.replace(/\s+/g, "");
}

// 1 銘柄ぶんの現在値＋指標を取得
async function fetchOne(code) {
  const symbol = `${code}.T`;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1y`;

  const res = await fetch(url, {
    headers: {
      // UA を付けないと 403 を返してくることがある
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120 Safari/537.36",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const json = await res.json();

  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  const q = result?.indicators?.quote?.[0] ?? {};
  const closes = q.close ?? [];
  const highs = q.high ?? [];
  const lows = q.low ?? [];
  const vols = q.volume ?? [];

  // 現在値: regularMarketPrice → 無ければ直近終値
  let price = meta?.regularMarketPrice;
  if (price == null) {
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) { price = closes[i]; break; }
    }
  }
  if (price == null) throw new Error("価格が取得できませんでした");

  // 当日騰落率: 直近2終値から（無ければ前日終値メタを使う）
  const validCloses = closes.filter((v) => v != null);
  const prevClose =
    validCloses.length >= 2
      ? validCloses[validCloses.length - 2]
      : (meta?.chartPreviousClose ?? meta?.previousClose ?? null);
  const changePct = prevClose ? ((Number(price) - prevClose) / prevClose) * 100 : null;

  // 52週高安: 1年ぶんの高値・安値
  const validHighs = highs.filter((v) => v != null);
  const validLows = lows.filter((v) => v != null);
  const week52High = validHighs.length ? Math.max(...validHighs) : null;
  const week52Low = validLows.length ? Math.min(...validLows) : null;

  // 直近出来高
  let volume = null;
  for (let i = vols.length - 1; i >= 0; i--) {
    if (vols[i] != null) { volume = vols[i]; break; }
  }

  return {
    price: Number(price),
    name: meta?.shortName || meta?.longName || null,
    week52High: week52High != null ? Math.round(week52High) : null,
    week52Low: week52Low != null ? Math.round(week52Low) : null,
    volume: volume != null ? Number(volume) : null,
    changePct: changePct != null ? Number(changePct.toFixed(2)) : null,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("codes") || searchParams.get("code") || "";
  const codes = [...new Set(raw.split(",").map(normCode).filter(Boolean))];

  if (codes.length === 0) {
    return Response.json({ error: "codes が指定されていません" }, { status: 400 });
  }

  const prices = {};
  const names = {};
  const metrics = {};
  const errors = {};

  // Yahoo の 429（レート制限）を避けるため、4 件ずつに分けて取得する
  const CHUNK = 4;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (code) => {
        try {
          const r = await fetchOne(code);
          prices[code] = r.price;
          if (r.name) names[code] = r.name;
          metrics[code] = {
            week52High: r.week52High,
            week52Low: r.week52Low,
            volume: r.volume,
            changePct: r.changePct,
          };
        } catch (e) {
          errors[code] = String(e.message ?? e);
        }
      })
    );
  }

  return Response.json({
    prices,
    names,
    metrics,
    errors,
    asOf: new Date().toISOString(),
  });
}