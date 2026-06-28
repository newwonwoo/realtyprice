"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PriceEstimate } from "@/types/model";
import type { Transaction } from "@/types/transaction";
import type { Listing } from "@/types/listing";

// 실거래 + 현재 호가 + 예상가 밴드를 한 타임라인에 겹쳐 보여줌
// X = 계약/수집 월(YYYY-MM 인덱스), Y = 가격(억). 호갱노노 산점도+밴드 벤치마크.

const eok = (manwon: number) => Number((manwon / 10000).toFixed(2));

// "2024-03-15" → "2024-03"
const ym = (d?: string) => (d ?? "").slice(0, 7);

export function PriceTimeline({
  estimate,
  transactions,
  listings,
}: {
  estimate: PriceEstimate;
  transactions: Transaction[];
  listings: Listing[];
}) {
  const saleTx = transactions
    .filter((t) => t.transactionType === "sale" && (t.price ?? 0) > 0 && t.contractDate)
    .map((t) => ({ ym: ym(t.contractDate), price: eok(t.price) }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  const saleListings = listings
    .filter((l) => l.listingType === "sale" && (l.askingPrice ?? 0) > 0)
    .map((l) => ({ ym: ym(l.capturedAt), price: eok(l.askingPrice) }));

  if (saleTx.length < 2 && saleListings.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        데이터 누적 중 — 실거래·호가가 더 모이면 추세 차트가 표시됩니다.
      </div>
    );
  }

  // X축 카테고리(월) 정렬 인덱스 구성
  const allYms = Array.from(new Set([...saleTx.map((x) => x.ym), ...saleListings.map((x) => x.ym)].filter(Boolean))).sort();
  const idxOf = new Map(allYms.map((m, i) => [m, i]));

  const txPoints = saleTx.map((x) => ({ x: idxOf.get(x.ym)!, tx: x.price }));
  const listingPoints = saleListings.map((x) => ({ x: idxOf.get(x.ym)!, ask: x.price }));

  // 실거래 월별 평균 → 이동평균(추세) 라인
  const byMonth = new Map<number, number[]>();
  for (const p of txPoints) {
    if (!byMonth.has(p.x)) byMonth.set(p.x, []);
    byMonth.get(p.x)!.push(p.tx);
  }
  const trend = Array.from(byMonth.entries())
    .map(([x, arr]) => ({ x, avg: arr.reduce((s, v) => s + v, 0) / arr.length }))
    .sort((a, b) => a.x - b.x);

  const mid = eok(estimate.expectedSaleMid);
  const min = eok(estimate.expectedSaleMin);
  const max = eok(estimate.expectedSaleMax);
  const rec = eok(estimate.recommendedAskingPrice);
  const def = eok(estimate.defensePrice);

  const allPrices = [...txPoints.map((p) => p.tx), ...listingPoints.map((p) => p.ask), min, max, rec, def];
  const yMin = Math.floor(Math.min(...allPrices) * 0.96 * 10) / 10;
  const yMax = Math.ceil(Math.max(...allPrices) * 1.04 * 10) / 10;

  return (
    <div className="w-full" style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[-0.5, allYms.length - 0.5]}
            ticks={allYms.map((_, i) => i)}
            tickFormatter={(i) => allYms[i] ?? ""}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
          />
          <YAxis type="number" domain={[yMin, yMax]} tickFormatter={(v) => `${v}억`} tick={{ fontSize: 11, fill: "#94a3b8" }} width={44} />
          <Tooltip
            formatter={(v: number, n: string) => [`${v}억`, n === "tx" ? "실거래" : n === "ask" ? "현재 호가" : n === "avg" ? "실거래 추세" : n]}
            labelFormatter={(i) => allYms[i as number] ?? ""}
          />
          {/* 예상가 밴드 (min~max) */}
          <ReferenceArea y1={min} y2={max} fill="#3b82f6" fillOpacity={0.08} ifOverflow="extendDomain" />
          <ReferenceLine y={mid} stroke="#2563eb" strokeDasharray="5 4" label={{ value: `예상 ${mid}억`, position: "insideTopRight", fontSize: 10, fill: "#2563eb" }} />
          <ReferenceLine y={rec} stroke="#10b981" strokeDasharray="2 3" label={{ value: `권장호가 ${rec}억`, position: "insideBottomRight", fontSize: 10, fill: "#10b981" }} />
          <ReferenceLine y={def} stroke="#f59e0b" strokeDasharray="2 3" label={{ value: `방어 ${def}억`, position: "insideBottomRight", fontSize: 10, fill: "#f59e0b" }} />
          {/* 실거래 점 */}
          <Scatter data={txPoints} dataKey="tx" fill="#1d4ed8" />
          {/* 현재 호가 점 (반투명) */}
          <Scatter data={listingPoints} dataKey="ask" fill="#94a3b8" fillOpacity={0.55} />
          {/* 추세선 */}
          {trend.length >= 2 && <Line data={trend} dataKey="avg" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
