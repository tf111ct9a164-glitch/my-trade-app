// mock/constituents.js
// 東証上場銘柄の辞書。JPXの「東証上場銘柄一覧 (data_j.xls)」から生成して貼り付ける。
export const CONSTITUENTS = [
  { code: "5803", name: "フジクラ",   sector: "非鉄金属" },
  { code: "6996", name: "ニチコン",   sector: "電気機器" },
  { code: "8058", name: "三菱商事",   sector: "卸売業" },
  { code: "7203", name: "トヨタ自動車", sector: "輸送用機器" },
  // …ここに約4000件を貼り付け（生成方法は後日実施）
];

const BY_CODE = new Map(CONSTITUENTS.map((s) => [s.code, s]));
const norm = (v) => String(v ?? "").trim().toUpperCase().replace(/\.T$/i, "").replace(/\s+/g, "");

export const findConstituent = (code) => BY_CODE.get(norm(code)) ?? null;