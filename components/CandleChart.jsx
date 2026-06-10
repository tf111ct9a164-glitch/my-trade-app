"use client";

// =============================================================================
//  components/CandleChart.jsx  （Lightweight Charts v5 正式API・完全版）
//
//  重要：v5 では chart.addCandlestickSeries() は廃止されています。
//        正しくは  chart.addSeries(CandlestickSeries, {...})。
//        ライン（MA）も chart.addSeries(LineSeries, {...})、
//        マーカーは createSeriesMarkers(series, [...]) を使います。
//
//  - 緑/赤ローソク足 ＋ MA5(紫)/MA25(白) ＋ 売買マーカー(BUY/SELL)
//  - マーカーは ref 保持のプラグインで「後から届いても」確実に再適用
//  - SSR無効前提（呼び出し側で next/dynamic ssr:false）。万一の競合に備え二重ガード
// =============================================================================

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  createSeriesMarkers,
} from "lightweight-charts";

function sma(data, period) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

function sortMarkers(markers) {
  return [...markers].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export default function CandleChart({ data = [], markers = [], showMA = true, height = 400 }) {
  const containerRef = useRef(null);
  const seriesRef = useRef(null);     // ローソク足シリーズ
  const markersApiRef = useRef(null); // マーカープラグイン

  // チャート本体：data / showMA が変わったら作り直す
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let chart;
    try {
      chart = createChart(el, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
          textColor: "#94a3b8",
          fontFamily: "'JetBrains Mono', monospace",
        },
        grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
        rightPriceScale: { borderColor: "#1e293b" },
        timeScale: { borderColor: "#1e293b" },
        crosshair: { mode: CrosshairMode.Normal },
      });

      // v5 正式API：addSeries(SeriesDefinition, options)
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#f43f5e",
        borderVisible: false,
        wickUpColor: "#10b981",
        wickDownColor: "#f43f5e",
      });
      series.setData(data);
      seriesRef.current = series;

      // 移動平均線（MA5＝紫 / MA25＝白）
      if (showMA && data.length > 0) {
        const ma5 = chart.addSeries(LineSeries, {
          color: "#a78bfa", lineWidth: 1.5,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        ma5.setData(sma(data, 5));

        const ma25 = chart.addSeries(LineSeries, {
          color: "#f8fafc", lineWidth: 1.5,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        ma25.setData(sma(data, 25));
      }

      // マーカー：生成と同時に現在値を適用（チャート再生成時も確実に乗る）
      markersApiRef.current = createSeriesMarkers(series, sortMarkers(markers));

      chart.timeScale().fitContent();
    } catch (err) {
      // 旧API混入やバージョン不整合を即座に可視化
      console.error("CandleChart init error:", err);
    }

    return () => {
      try { chart && chart.remove(); } catch (_) {}
      seriesRef.current = null;
      markersApiRef.current = null;
    };
    // markers は別 effect で更新するため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showMA]);

  // マーカーが後から届いた／変わった場合：チャートは作り直さず確実に再適用
  useEffect(() => {
    if (markersApiRef.current) {
      try {
        markersApiRef.current.setMarkers(sortMarkers(markers));
      } catch (err) {
        console.error("CandleChart setMarkers error:", err);
      }
    }
  }, [markers]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
