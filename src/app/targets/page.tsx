"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TargetApartmentSearch } from "@/components/targets/TargetApartmentSearch";
import { defaultComparableRule } from "@/lib/seed";
import { nowIso } from "@/lib/format";
import { useRealtyStore } from "@/lib/clientStore";
import type { Apartment } from "@/types/apartment";

export default function TargetsPage() {
  const store = useRealtyStore();

  function addTarget(apartment: Apartment) {
    const sameTargetExists = store.targets.some((target) =>
      target.name.trim().toLowerCase() === apartment.name.trim().toLowerCase() &&
      target.address.trim().toLowerCase() === apartment.address.trim().toLowerCase()
    );
    if (sameTargetExists) return false;
    const now = nowIso();
    const target: Apartment = {
      ...apartment,
      id: apartment.id.startsWith("target_") ? apartment.id : `target_${Date.now()}`,
      role: "target",
      createdAt: apartment.createdAt ?? now,
      updatedAt: now
    };
    store.setApartments([target, ...store.apartments]);
    if (!store.comparableRules.some((rule) => rule.targetApartmentId === target.id)) {
      store.setComparableRules([...store.comparableRules, defaultComparableRule(target.id)]);
    }
    return true;
  }

  function deleteTarget(apartmentId: string) {
    store.setApartments(store.apartments.filter((apartment) => apartment.id !== apartmentId));
    store.setComparableRules(store.comparableRules.filter((rule) => rule.targetApartmentId !== apartmentId));
    store.setComparableApartments(store.comparableApartments.filter((item) => item.targetApartmentId !== apartmentId));
    store.setTransactions(store.transactions.filter((item) => item.apartmentId !== apartmentId));
    store.setListings(store.listings.filter((item) => item.apartmentId !== apartmentId));
    store.setInventorySignals(store.inventorySignals.filter((item) => item.apartmentId !== apartmentId));
    store.setPriceEstimates(store.priceEstimates.filter((item) => item.targetApartmentId !== apartmentId));
  }

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Targets</p>
        <h1 className="text-3xl font-black">대상아파트 관리</h1>
        <p className="mt-2 text-slate-600">사용자가 추가하는 모든 아파트는 대상아파트로 저장됩니다.</p>
      </div>

      <TargetApartmentSearch apartments={store.apartments} onAdd={addTarget} />

      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-black">등록된 대상아파트</h2>
        </div>
        <table className="table w-full">
          <thead>
            <tr><th>단지명</th><th>지역</th><th>주소</th><th>브랜드</th><th>관리</th></tr>
          </thead>
          <tbody>
            {store.targets.map((apartment) => (
              <tr key={apartment.id}>
                <td className="font-semibold">{apartment.name}</td>
                <td>{apartment.region}</td>
                <td>{apartment.address}</td>
                <td>{apartment.brand ?? "-"}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Link className="btn-secondary" href={`/targets/${apartment.id}`}>상세</Link>
                    <button className="btn-danger" onClick={() => deleteTarget(apartment.id)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
            {!store.targets.length && (
              <tr><td colSpan={5} className="text-center text-slate-500">등록된 대상아파트가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
