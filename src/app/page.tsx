"use client";

import { AppShell } from "@/components/AppShell";
import { ApartmentSignalCard } from "@/components/dashboard/ApartmentSignalCard";
import { useRealtyStore } from "@/lib/clientStore";

export default function DashboardPage() {
  const store = useRealtyStore();

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Dashboard</p>
        <h1 className="text-3xl font-black">분양권 매각판단 대시보드</h1>
        <p className="mt-2 text-slate-600">대상아파트별 예상가격과 상승가능성 신호를 요약합니다.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {store.targets.map((apt) => (
          <ApartmentSignalCard key={apt.id} apartment={apt} estimate={store.priceEstimates.find((x) => x.targetApartmentId === apt.id)} />
        ))}
      </div>
    </AppShell>
  );
}
