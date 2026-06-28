"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";
import type { PriceEstimate } from "@/types/model";

// 상승점수 반원 게이지 + 6신호 누적 기여 막대 + 신뢰도 미니 게이지
// "왜 N점인지"를 기저값 위에 신호별 적립으로 분해. 점수대별 구간색.

const zoneColor = (score: number) =>
  score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";

// "+12점" / "35점" / "-3점" → 숫자
function parseScore(result: string): number {
  const m = result.match(/(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

const SEG_COLORS = ["#94a3b8", "#3b82f6", "#0ea5e9", "#6366f1", "#8b5cf6", "#10b981", "#f59e0b"];

function HalfGauge({ score, label, max = 100 }: { score: number; label: string; max?: number }) {
  const clamped = Math.max(0, Math.min(max, score));
  const data = [
    { name: "value", value: clamped },
    { name: "rest", value: max - clamped },
  ];
  return (
    <div className="relative" style={{ width: 160, height: 96 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            startAngle={180}
            endAngle={0}
            innerRadius={52}
            outerRadius={76}
            cy="100%"
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={zoneColor((clamped / max) * 100)} />
            <Cell fill="#e2e8f0" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-2xl font-black tabular-nums" style={{ color: zoneColor((clamped / max) * 100) }}>
          {Math.round(score)}
        </span>
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
    </div>
  );
}

export function UpsideGauge({ estimate }: { estimate: PriceEstimate }) {
  const upside = estimate.modelBreakdown.filter((f) => f.group === "upside" && f.active);
  const segs = upside
    .map((f) => ({ label: f.label, score: parseScore(f.result) }))
    .filter((s) => s.score !== 0);

  const positive = segs.filter((s) => s.score > 0);
  const totalPos = positive.reduce((s, x) => s + x.score, 0) || 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-center gap-8">
        <HalfGauge score={estimate.upsideScore} label="상승점수 / 100" />
        <HalfGauge score={estimate.confidenceScore} label="신뢰도 / 100" />
      </div>

      {/* 신호별 누적 기여 막대 */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500">상승점수 구성 (기저 + 신호별 적립)</p>
        <div className="flex h-6 w-full overflow-hidden rounded-md border border-slate-100">
          {positive.map((s, i) => (
            <div
              key={s.label}
              className="flex items-center justify-center text-[10px] font-bold text-white"
              style={{ width: `${(s.score / totalPos) * 100}%`, backgroundColor: SEG_COLORS[i % SEG_COLORS.length] }}
              title={`${s.label} +${s.score}점`}
            >
              {s.score >= 6 ? `+${s.score}` : ""}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {segs.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1 text-[11px] text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.score > 0 ? SEG_COLORS[i % SEG_COLORS.length] : "#ef4444" }} />
              {s.label} <b className={s.score > 0 ? "text-slate-700" : "text-red-500"}>{s.score > 0 ? "+" : ""}{s.score}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
