"use client";

import { AppShell } from "@/components/AppShell";
import { ApartmentSignalCard } from "@/components/dashboard/ApartmentSignalCard";
import { formatEok, formatPercent } from "@/lib/format";
import { median } from "@/lib/inventory";
import { useRealtyStore } from "@/lib/clientStore";

export default function DashboardPage() {
  const store = useRealtyStore();
  const expectedSales = store.priceEstimates.map((estimate) => estimate.expectedSaleMid).filter(Boolean);
  const strongSignals = store.inventorySignals.filter((signal) => signal.lowPriceAbsorptionRate >= 0.3).length;

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Dashboard</p>
        <h1 className="text-3xl font-black">분양권 매각판단 대시보드</h1>
        <p className="mt-2 text-slate-600">대상아파트별 예상가격과 상승가능성 신호를 요약합니다.</p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Summary label="대상아파트" value={`${store.targets.length}개`} />
        <Summary label="가격추정 완료" value={`${store.priceEstimates.length}개`} />
        <Summary label="중앙 예상 매매가" value={formatEok(median(expectedSales))} />
        <Summary label="강한 저가소진 신호" value={`${strongSignals}개`} helper={formatPercent(0.3)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {store.targets.map((apartment) => (
          <ApartmentSignalCard key={apartment.id} apartment={apartment} estimate={store.priceEstimates.find((estimate) => estimate.targetApartmentId === apartment.id)} />
        ))}
        {!store.targets.length && <div className="card p-6 text-slate-600">대상아파트를 먼저 추가하세요.</div>}
      </div>
    </AppShell>
  );
}

function Summary({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      {helper && <p className="mt-1 text-xs text-slate-500">기준 {helper} 이상</p>}
    </div>
  );
}
