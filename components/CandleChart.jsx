"use client";

// =============================================================================
//  components/CandleChart.jsx  （Lightweight Charts v5 正式API・完全版）
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

// 🌟 maShort と maLong を props に追加（デフォルト値を 5 と 25 に設定）
export default function CandleChart({ data = [], markers = [], showMA = true, maShort = 5, maLong = 25, height = 400 }) {
  const containerRef = useRef(null);
  const seriesRef = useRef(null);     // ローソク足シリーズ
  const markersApiRef = useRef(null); // マーカープラグイン

  // チャート本体：データや移動平均線の設定が変わったら作り直す
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

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#f43f5e",
        borderVisible: false,
        wickUpColor: "#10b981",
        wickDownColor: "#f43f5e",
      });
      series.setData(data);
      seriesRef.current = series;

      // 🌟 固定値の 5, 25 ではなく、maShort と maLong を使うように修正
      if (showMA && data.length > 0) {
        const ma1 = chart.addSeries(LineSeries, {
          color: "#a78bfa", lineWidth: 1.5,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        ma1.setData(sma(data, maShort));

        const ma2 = chart.addSeries(LineSeries, {
          color: "#f8fafc", lineWidth: 1.5,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        ma2.setData(sma(data, maLong));
      }

      markersApiRef.current = createSeriesMarkers(series, sortMarkers(markers));

      chart.timeScale().fitContent();
    } catch (err) {
      console.error("CandleChart init error:", err);
    }

    return () => {
      try { chart && chart.remove(); } catch (_) {}
      seriesRef.current = null;
      markersApiRef.current = null;
    };
    // 🌟 依存配列に maShort と maLong を追加（ここが変更されたらグラフを書き直すため）
  }, [data, showMA, maShort, maLong]);

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