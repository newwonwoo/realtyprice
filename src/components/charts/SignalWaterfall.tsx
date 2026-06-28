"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PriceEstimate } from "@/types/model";

// 가격신호 기여도 워터폴 — "왜 이 예상가인지" 시각화
// 대상 실거래가 앵커(A)에서 시작해 각 활성 신호의 가중기여분(p_i - A)·w_i 를 누적,
// expectedSaleMid 에 도달. 상승=blue, 하향=red. (투명 베이스 + 가시 막대 기법)

// 모델 분해의 가격 그룹 label ↔ PriceEstimate 숫자 필드 매핑
const PRICE_FIELDS: { label: string; key: keyof PriceEstimate }[] = [
  { label: "대상단지 실거래가", key: "targetSalePrice" },
  { label: "비교단지 보정 실거래가", key: "adjustedComparableSalePrice" },
  { label: "비교단지 현재 호가", key: "comparableAskingPrice" },
  { label: "대상단지 현재 호가", key: "saleAskingPrice" },
  { label: "전세기반 하방가", key: "jeonseFloorPrice" },
  { label: "매물 소진 반영가", key: "inventorySignalPrice" },
  { label: "분양가 프리미엄", key: "presalePremiumPrice" },
  { label: "대장아파트 앵커", key: "leaderApartmentAnchorPrice" },
  { label: "대상 입지 보정", key: "locationPremiumPrice" },
  { label: "비교단지 상·하급지 압력", key: "comparableMarketPressurePrice" },
];

// "가중 20%" → 0.2
function parseWeightPct(weight: string): number {
  const m = weight.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) / 100 : 0;
}

const eok = (manwon: number) => manwon / 10000;
const fmtSigned = (manwonDelta: number) => {
  const e = manwonDelta / 10000;
  return `${e >= 0 ? "+" : ""}${e.toFixed(2)}억`;
};

type Row = {
  name: string;
  base: number;     // 투명 베이스 (누적 시작 높이)
  value: number;    // 가시 막대 길이 (절댓값)
  delta: number;    // 실제 기여(부호), 억 단위
  isAnchor?: boolean;
  isTotal?: boolean;
};

export function SignalWaterfall({ estimate }: { estimate: PriceEstimate }) {
  const priceFactors = estimate.modelBreakdown.filter((f) => f.group === "price" && f.active);
  const weightByLabel = new Map(priceFactors.map((f) => [f.label, parseWeightPct(f.weight)]));

  // 앵커: 대상단지 실거래가가 활성이면 그것, 아니면 첫 활성 신호
  const active = PRICE_FIELDS
    .map((pf) => ({ label: pf.label, price: Number(estimate[pf.key] ?? 0), w: weightByLabel.get(pf.label) ?? 0 }))
    .filter((x) => x.price > 0 && x.w > 0);

  if (active.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        기여도 분해를 표시할 신호가 부족합니다 (활성 신호 2개 이상 필요).
      </div>
    );
  }

  const anchor = active[0]; // PRICE_FIELDS 순서상 대상 실거래가 우선
  const anchorEok = eok(anchor.price);

  const rows: Row[] = [];
  rows.push({ name: anchor.label, base: 0, value: anchorEok, delta: anchor.price, isAnchor: true });

  let cum = anchorEok;
  for (const x of active) {
    if (x.label === anchor.label) continue;
    const deltaManwon = (x.price - anchor.price) * x.w; // 가중 기여(부호)
    const deltaEok = deltaManwon / 10000;
    const start = deltaEok >= 0 ? cum : cum + deltaEok;
    rows.push({
      name: x.label,
      base: start,
      value: Math.abs(deltaEok),
      delta: deltaManwon,
    });
    cum += deltaEok;
  }

  // 최종 예상가 막대
  rows.push({ name: "예상 매매가", base: 0, value: eok(estimate.expectedSaleMid), delta: estimate.expectedSaleMid, isTotal: true });

  const maxY = Math.max(...rows.map((r) => r.base + r.value)) * 1.12;

  return (
    <div className="w-full" style={{ height: Math.max(260, rows.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 8 }}>
          <XAxis type="number" domain={[0, maxY]} tickFormatter={(v) => `${v.toFixed(1)}억`} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#475569" }} />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            formatter={(_v, _n, p) => {
              const r = p.payload as Row;
              if (r.isAnchor) return [`${eok(r.delta).toFixed(2)}억`, "앵커(기준)"];
              if (r.isTotal) return [`${eok(r.delta).toFixed(2)}억`, "최종 예상가"];
              return [fmtSigned(r.delta), "가중 기여"];
            }}
          />
          {/* 투명 베이스 */}
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          {/* 가시 막대 */}
          <Bar dataKey="value" stackId="w" radius={[2, 2, 2, 2]} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell
                key={i}
                fill={r.isAnchor ? "#64748b" : r.isTotal ? "#2563eb" : r.delta >= 0 ? "#3b82f6" : "#ef4444"}
              />
            ))}
            <LabelList
              dataKey="delta"
              position="right"
              formatter={(v: number) => {
                const row = rows.find((r) => r.delta === v);
                if (row?.isAnchor || row?.isTotal) return `${eok(v).toFixed(2)}억`;
                return fmtSigned(v);
              }}
              style={{ fontSize: 11, fill: "#334155", fontWeight: 700 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
