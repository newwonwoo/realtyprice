"use client";

import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { nowIso } from "@/lib/format";

export default function ComparablesPage() {
  const store = useRealtyStore();

  function toggle(targetApartmentId: string, apartmentId: string) {
    const existing = store.comparableApartments.find((x) => x.targetApartmentId === targetApartmentId && x.apartmentId === apartmentId);
    if (existing) {
      store.setComparableApartments(store.comparableApartments.map((x) => x.id === existing.id ? { ...x, selected: !x.selected } : x));
      return;
    }
    store.setComparableApartments([
      ...store.comparableApartments,
      {
        id: `ca_${Date.now()}`,
        targetApartmentId,
        apartmentId,
        selected: true,
        manualAdded: true,
        compareWeight: 20,
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    ]);
  }

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Comparables</p>
        <h1 className="text-3xl font-black">비교단지 관리</h1>
        <p className="mt-2 text-slate-600">대상아파트별로 비교단지를 직접 선택하고 가중치를 관리합니다.</p>
      </div>
      {store.targets.map((target) => (
        <div key={target.id} className="card mb-6 p-5">
          <h2 className="text-xl font-black">{target.shortName ?? target.name}</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="table w-full">
              <thead><tr><th>선택</th><th>단지명</th><th>지역</th><th>입주</th><th>세대수</th><th>가중치</th></tr></thead>
              <tbody>
                {store.comparables.map((apt) => {
                  const selected = store.comparableApartments.find((x) => x.targetApartmentId === target.id && x.apartmentId === apt.id);
                  return (
                    <tr key={`${target.id}_${apt.id}`}>
                      <td><input type="checkbox" checked={!!selected?.selected} onChange={() => toggle(target.id, apt.id)} /></td>
                      <td className="font-semibold">{apt.name}</td>
                      <td>{apt.region}</td>
                      <td>{apt.builtYear ?? "-"}</td>
                      <td>{apt.households ?? "-"}</td>
                      <td>{selected?.compareWeight ?? 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </AppShell>
  );
}
