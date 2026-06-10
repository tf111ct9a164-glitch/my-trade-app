// =============================================================================
//  mock/data.js（全銘柄マスター対応・完全ドッキング版）
// =============================================================================

import { findConstituent } from "@/mock/constituents";

export const SCREENER_STOCKS = [
  // code,  name,                   sector,       price,  per,  pbr,  dividendYield(%)
  { code: "7203", name: "トヨタ自動車",          sector: "自動車",     price: 2890,  per: 9.8,  pbr: 1.1, dividendYield: 2.6 },
  { code: "7267", name: "ホンダ",                sector: "自動車",     price: 1650,  per: 8.2,  pbr: 0.7, dividendYield: 3.9 },
  { code: "6758", name: "ソニーグループ",        sector: "電気機器",   price: 14850, per: 19.5, pbr: 2.4, dividendYield: 0.6 },
  { code: "6861", name: "キーエンス",            sector: "電気機器",   price: 64200, per: 38.0, pbr: 5.5, dividendYield: 0.5 },
  { code: "6501", name: "日立製作所",            sector: "電気機器",   price: 3800,  per: 14.0, pbr: 1.8, dividendYield: 1.4 },
  { code: "6594", name: "ニデック",              sector: "電気機器",   price: 3200,  per: 24.0, pbr: 2.1, dividendYield: 1.0 },
  { code: "9984", name: "ソフトバンクグループ",  sector: "情報・通信", price: 8650,  per: 16.0, pbr: 1.3, dividendYield: 0.5 },
  { code: "9432", name: "日本電信生命",          sector: "情報・通信", price: 159,   per: 11.5, pbr: 1.4, dividendYield: 3.4 },
  { code: "9433", name: "KDDI",                  sector: "情報・通信", price: 4900,  per: 14.5, pbr: 1.7, dividendYield: 3.1 },
  { code: "4689", name: "LINEヤフー",            sector: "情報・通信", price: 430,   per: 18.0, pbr: 1.6, dividendYield: 1.6 },
  { code: "8306", name: "三菱UFJ FG",            sector: "銀行",       price: 1875,  per: 12.5, pbr: 0.9, dividendYield: 3.0 },
  { code: "8316", name: "三井住友FG",            sector: "銀行",       price: 10500, per: 12.0, pbr: 0.8, dividendYield: 3.5 },
  { code: "8411", name: "みずほFG",              sector: "銀行",       price: 3600,  per: 11.0, pbr: 0.8, dividendYield: 3.8 },
  { code: "8058", name: "三菱商事",              sector: "商社",       price: 2750,  per: 10.5, pbr: 1.2, dividendYield: 3.2 },
  { code: "8031", name: "三井物産",              sector: "商社",       price: 7600,  per: 11.0, pbr: 1.3, dividendYield: 2.8 },
  { code: "8001", name: "伊藤忠商事",            sector: "商社",       price: 7400,  per: 12.0, pbr: 1.6, dividendYield: 2.5 },
  { code: "9983", name: "ファーストリテイリング", sector: "小売",      price: 48000, per: 40.0, pbr: 7.0, dividendYield: 0.7 },
  { code: "3382", name: "セブン&アイ",           sector: "小売",       price: 2300,  per: 22.0, pbr: 1.3, dividendYield: 1.7 },
  { code: "8267", name: "イオン",                sector: "小売",       price: 3500,  per: 45.0, pbr: 2.3, dividendYield: 1.1 },
  { code: "4502", name: "武田薬品工業",          sector: "医薬品",     price: 4100,  per: 18.0, pbr: 1.0, dividendYield: 4.7 },
  { code: "4568", name: "第一三共",              sector: "医薬品",     price: 4800,  per: 35.0, pbr: 4.2, dividendYield: 1.2 },
  { code: "4503", name: "アステラス製薬",        sector: "医薬品",     price: 1550,  per: 20.0, pbr: 1.5, dividendYield: 4.2 },
  { code: "2914", name: "日本たばこ産業",        sector: "食品",       price: 4200,  per: 14.0, pbr: 1.8, dividendYield: 4.9 },
  { code: "2502", name: "アサヒGHD",             sector: "食品",       price: 5800,  per: 13.5, pbr: 1.4, dividendYield: 2.0 },
  { code: "2802", name: "味の素",                sector: "食品",       price: 5900,  per: 28.0, pbr: 2.9, dividendYield: 1.1 },
  { code: "4063", name: "信越化学工業",          sector: "化学",       price: 5600,  per: 19.0, pbr: 2.0, dividendYield: 1.6 },
  { code: "4901", name: "富士フイルム",          sector: "化学",       price: 3400,  per: 17.0, pbr: 1.5, dividendYield: 1.5 },
  { code: "8801", name: "三井不動産",            sector: "不動産",     price: 1450,  per: 13.0, pbr: 1.1, dividendYield: 2.1 },
  { code: "8802", name: "三菱地所",              sector: "不動産",     price: 2600,  per: 16.0, pbr: 1.3, dividendYield: 1.6 },
  { code: "7011", name: "三菱重工業",            sector: "機械",       price: 2100,  per: 25.0, pbr: 2.5, dividendYield: 1.2 },
];

// 業種の一覧（フィルタのプルダウン用）
export const SECTORS = [...new Set(SCREENER_STOCKS.map((s) => s.sector))];

// 銘柄コードから銘柄情報を引く（★主要30銘柄になければ全銘柄辞書から引き当てるように進化！）
export function findStock(code) {
  if (!code) return null;
  const c = String(code).trim();
  return SCREENER_STOCKS.find((s) => s.code === c) ?? findConstituent(c);
}

// ---- ローソク足ダミーデータの生成 ------------------------------------------
function seedFromCode(code) {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getCandleData(code, days = 140) {
  const stock = findStock(code); // ★ここも全銘柄対応に変更
  const basePrice = stock ? (stock.price ?? 1000) : 1000;
  const rand = mulberry32(seedFromCode(code));

  const out = [];
  const start = new Date();
  start.setDate(start.getDate() - days);

  let cur = basePrice * (0.8 + rand() * 0.15);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;

    const drift = (basePrice - cur) * 0.015;
    const vol = cur * 0.02;
    const open = cur;
    const close = Math.max(1, open + drift + (rand() - 0.5) * vol * 2);
    const high = Math.max(open, close) + rand() * vol;
    const low = Math.max(1, Math.min(open, close) - rand() * vol);

    const r = (v) => Math.round(v);
    out.push({ time: d.toISOString().slice(0, 10), open: r(open), high: r(high), low: r(low), close: r(close) });
    cur = close;
  }

  return out;
}