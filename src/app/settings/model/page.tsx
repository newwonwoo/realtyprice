"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { defaultModelWeights } from "@/lib/seed";
import { readStorage, STORAGE_KEYS, writeStorage } from "@/lib/storage";
import type { ModelWeights } from "@/types/model";

const labels: Record<keyof ModelWeights, string> = {
  adjustedComparableSale: "비교단지 보정 실거래가 (시간감쇠 적용)",
  askingPrice: "현재 매매호가",
  jeonseFloorPrice: "전세기반 하방가",
  inventorySignal: "매물소진속도",
  presalePremium: "분양가 대비 프리미엄",
  macroSignal: "거시환경",
  leaderApartmentAnchor: "대장아파트 앵커 (인근 지하철 1~2역 최다거래 단지)"
};

export default function ModelSettingsPage() {
  const [weights, setWeights] = useState<ModelWeights>(() => readStorage<ModelWeights>(STORAGE_KEYS.modelSettings, defaultModelWeights));

  function update(key: keyof ModelWeights, value: string) {
    const next = { ...weights, [key]: Number(value) / 100 };
    setWeights(next);
    writeStorage(STORAGE_KEYS.modelSettings, next);
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <AppShell>
      <div className="mb-8"><p className="text-sm font-semibold text-blue-600">Model</p><h1 className="text-3xl font-black">가격추정 모델 설정</h1></div>
      <div className="card p-5">
        <p className="mb-5 text-sm text-slate-600">가중치 합계: {(total * 100).toFixed(0)}%</p>
        <div className="space-y-4">
          {(Object.keys(weights) as (keyof ModelWeights)[]).map((key) => (
            <label key={key} className="grid gap-3 md:grid-cols-[1fr_180px] md:items-center">
              <span className="font-semibold">{labels[key]}</span>
              <input className="input" type="number" value={Math.round(weights[key] * 100)} onChange={(e) => update(key, e.target.value)} />
            </label>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
