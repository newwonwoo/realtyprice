"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { ComparablesManager } from "@/components/comparables/ComparablesManager";

export default function ComparablesPage() {
  const store = useRealtyStore();
  const [targetId, setTargetId] = useState("");
  const activeTargetId = targetId || store.targets[0]?.id || "";

  const selectedCount = store.comparableApartments.filter((item) => item.targetApartmentId === activeTargetId).length;

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold text-blue-600">Comparables · 일괄 도구</p>
        <h1 className="text-3xl font-black">비교단지 관리</h1>
        <p className="mt-2 text-slate-600">
          여러 대상아파트의 비교단지를 한 곳에서 관리하는 일괄 도구입니다.
          개별 대상은 <a href="/targets" className="font-semibold text-blue-600 hover:underline">대상아파트 상세페이지</a>에서 한 번에 처리할 수 있습니다.
        </p>
      </div>

      {/* 대상아파트 선택 */}
      <div className="card p-5">
        <label className="text-sm font-bold text-slate-700" htmlFor="target">대상아파트</label>
        <select id="target" className="input mt-2" value={activeTargetId} onChange={(event) => setTargetId(event.target.value)}>
          {store.targets.map((target) => <option key={target.id} value={target.id}>{target.shortName ?? target.name}</option>)}
        </select>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="선택 단지" value={`${selectedCount}개`} />
          <Metric label="후보 단지" value={`${store.comparables.length}개`} />
        </div>
      </div>

      {activeTargetId ? (
        <div className="mt-5">
          <ComparablesManager targetId={activeTargetId} />
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-400">등록된 대상아파트가 없습니다. 먼저 대상아파트를 추가하세요.</p>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}
