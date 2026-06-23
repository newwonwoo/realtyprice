"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { defaultComparableRule } from "@/lib/seed";
import { nowIso } from "@/lib/format";
import { autoLeaderRatio } from "@/lib/locationScore";
import { findLeaderForAddress, LEADER_APARTMENTS } from "@/lib/leaderApartments";
import type { Apartment, ComparableRule } from "@/types/apartment";
import { ComparableSuggestions } from "@/components/comparables/ComparableSuggestions";
import { TransactionFetcher } from "@/components/targets/TransactionFetcher";
import { BulkTransactionFetcher } from "@/components/comparables/BulkTransactionFetcher";

export default function ComparablesPage() {
  const store = useRealtyStore();
  const [targetId, setTargetId] = useState("");
  const activeTargetId = targetId || store.targets[0]?.id || "";
  const activeTarget = store.targets.find((target) => target.id === activeTargetId);
  const rule = useMemo(
    () => store.comparableRules.find((item) => item.targetApartmentId === activeTargetId) ?? defaultComparableRule(activeTargetId),
    [activeTargetId, store.comparableRules]
  );

  function saveRule(next: ComparableRule) {
    const exists = store.comparableRules.some((item) => item.targetApartmentId === next.targetApartmentId);
    store.setComparableRules(exists ? store.comparableRules.map((item) => item.targetApartmentId === next.targetApartmentId ? next : item) : [...store.comparableRules, next]);
  }

  function updateRule(key: keyof ComparableRule, value: string) {
    const numericKeys = ["maxDistanceKm", "minBuiltYear", "maxBuiltYear", "minHouseholds", "areaMin", "areaMax", "weightDistance", "weightNewness", "weightBrand", "weightStation", "weightHouseholds"];
    const nextValue = key === "regionKeywords" ? value.split(",").map((item) => item.trim()).filter(Boolean) : numericKeys.includes(key) ? Number(value) : value;
    saveRule({ ...rule, [key]: nextValue, targetApartmentId: activeTargetId });
  }

  function upsertComparable(apartmentId: string, selected: boolean, compareWeight?: number) {
    const existing = store.comparableApartments.find((item) => item.targetApartmentId === activeTargetId && item.apartmentId === apartmentId);
    if (existing) {
      store.setComparableApartments(store.comparableApartments.map((item) => item.id === existing.id ? { ...item, selected, compareWeight: compareWeight ?? item.compareWeight, updatedAt: nowIso() } : item));
      return;
    }
    store.setComparableApartments([
      ...store.comparableApartments,
      {
        id: `ca_${Date.now()}_${apartmentId}`,
        targetApartmentId: activeTargetId,
        apartmentId,
        selected,
        manualAdded: true,
        compareWeight: compareWeight ?? 20,
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    ]);
  }

  // 자동추천에서 새 비교단지(공공데이터) 추가: store에 저장 + 선택 링크 생성
  function addSuggestedComparable(apt: Apartment) {
    if (!store.apartments.some((a) => a.id === apt.id)) {
      store.setApartments([...store.apartments, apt]);
    }
    upsertComparable(apt.id, true);
  }

  const existingComparableIds = new Set(store.apartments.map((a) => a.id));
  const selectedCount = store.comparableApartments.filter((item) => item.targetApartmentId === activeTargetId && item.selected).length;

  // 대장아파트 자동 지정: 대상이 바뀌고 대장이 미설정이면 하드코딩 테이블에서 즉시 적용
  const suggestedLeader = activeTarget ? findLeaderForAddress(activeTarget.address ?? activeTarget.region ?? "") : undefined;

  useEffect(() => {
    if (!activeTarget || !suggestedLeader) return;
    const id = `leader_${suggestedLeader.region.replace(/\s/g, "_")}_${suggestedLeader.name.replace(/\s/g, "_")}`;

    // store에 없으면 항상 재추가 (페이지 재로드 후 store 초기화 대응)
    const existing = store.apartments.find((a) => a.id === id);
    const leaderApt: Apartment = existing ?? {
      id,
      name: suggestedLeader.name,
      region: suggestedLeader.region,
      address: suggestedLeader.address,
      brand: suggestedLeader.brand,
      households: suggestedLeader.households,
      role: "comparable",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!existing) store.setApartments([...store.apartments, leaderApt]);

    // rule 미설정일 때만 자동 지정
    if (rule.leaderApartmentId) return;
    const ratio = autoLeaderRatio(activeTarget, leaderApt, store.transactions, activeTarget.defaultArea);
    saveRule({ ...rule, leaderApartmentId: id, targetToLeaderRatio: ratio, targetApartmentId: activeTargetId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTargetId]);

  const currentLeaderName = rule.leaderApartmentId
    ? (store.apartments.find((a) => a.id === rule.leaderApartmentId)?.name ?? LEADER_APARTMENTS.find((e) => e.region + "_" + e.name === rule.leaderApartmentId)?.name)
    : undefined;

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Comparables</p>
        <h1 className="text-3xl font-black">비교단지 관리</h1>
        <p className="mt-2 text-slate-600">비교단지는 대상아파트별로 선택/제외하고 가중치를 따로 저장합니다.</p>
      </div>

      <div className="flex flex-col gap-5">
        {/* 상단: 설정 영역 - 2열 그리드 */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* 1열: 대상아파트 선택 */}
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

          {/* 2열: 필터 조건 */}
          <div className="card p-5">
            <p className="text-sm font-black text-slate-700 mb-3">필터 조건</p>
            <div className="space-y-3">
              <NumberField label="최대 거리(km)" value={rule.maxDistanceKm} onChange={(value) => updateRule("maxDistanceKm", value)} />
              <NumberField label="최소 입주연도" value={rule.minBuiltYear ?? ""} onChange={(value) => updateRule("minBuiltYear", value)} />
              <NumberField label="최대 입주연도" value={rule.maxBuiltYear ?? ""} onChange={(value) => updateRule("maxBuiltYear", value)} />
              <NumberField label="최소 세대수" value={rule.minHouseholds ?? ""} onChange={(value) => updateRule("minHouseholds", value)} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="면적 하한" value={rule.areaMin} onChange={(value) => updateRule("areaMin", value)} />
                <NumberField label="면적 상한" value={rule.areaMax} onChange={(value) => updateRule("areaMax", value)} />
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">지역 키워드</span>
                <input className="input mt-1" value={rule.regionKeywords.join(", ")} onChange={(event) => updateRule("regionKeywords", event.target.value)} placeholder="오산, 송도" />
              </label>
            </div>
          </div>
        </div>

        {/* 자동추천 - 전체 너비 (대장 표시 포함) */}
        {activeTarget && (
          <div className="card p-5">
            <ComparableSuggestions
              target={activeTarget}
              existingComparableIds={existingComparableIds}
              onAddComparable={addSuggestedComparable}
            />
          </div>
        )}

        {/* 대장아파트 설정 - 추천 다음 */}
        <div className="card p-5">
          <p className="text-sm font-black text-blue-800">👑 대장아파트 설정</p>
          <p className="mt-1 text-xs text-blue-600">가격 추정 시 spillover 앵커로 사용됩니다. 대장 단지의 실거래도 수집하면 비율이 더 정확해집니다.</p>

          {/* 자동 지정 안내 */}
          {currentLeaderName && suggestedLeader && currentLeaderName === suggestedLeader.name && (
            <p className="mt-2 text-xs text-blue-600">지역 테이블에서 자동 지정됨 — 변경 가능</p>
          )}
          {!suggestedLeader && !rule.leaderApartmentId && (
            <p className="mt-2 text-xs text-slate-400">이 지역의 대장단지가 테이블에 없습니다. 아래에서 수동 선택하세요.</p>
          )}

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">대장아파트 선택</span>
              <select
                className="input mt-1"
                value={rule.leaderApartmentId ?? ""}
                onChange={(e) => {
                  const leaderId = e.target.value || undefined;
                  const leader = leaderId ? store.apartments.find((a) => a.id === leaderId) : undefined;
                  const ratio = activeTarget && leader
                    ? autoLeaderRatio(activeTarget, leader, store.transactions, activeTarget.defaultArea)
                    : undefined;
                  saveRule({ ...rule, leaderApartmentId: leaderId, targetToLeaderRatio: ratio, targetApartmentId: activeTargetId });
                }}
              >
                <option value="">-- 미설정 --</option>
                {store.apartments.filter((a) => a.id !== activeTargetId).map((a) => (
                  <option key={a.id} value={a.id}>{a.shortName ?? a.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">대상/대장 가격 비율 (%)</span>
              <input
                className="input mt-1"
                type="number"
                min="50"
                max="130"
                step="1"
                placeholder="예: 88 (대상이 대장의 88%)"
                value={rule.targetToLeaderRatio !== undefined ? Math.round(rule.targetToLeaderRatio * 100) : ""}
                onChange={(e) => saveRule({ ...rule, targetToLeaderRatio: e.target.value ? Number(e.target.value) / 100 : undefined, targetApartmentId: activeTargetId })}
              />
              <p className="mt-1 text-xs text-slate-400">대장 선택 시 자동산출 (실거래 우선 → 입지점수 근사). 직접 수정 가능.</p>
            </label>
          </div>

          {/* 대장 실거래 수집 */}
          {rule.leaderApartmentId && rule.leaderApartmentId !== activeTargetId && (() => {
            const leaderApt = store.apartments.find((a) => a.id === rule.leaderApartmentId);
            if (!leaderApt) return null;
            const leaderTxs = store.transactions.filter((tx) => tx.apartmentId === rule.leaderApartmentId);
            return (
              <div className="mt-4">
                <p className="mb-1 text-xs font-bold text-blue-700">
                  대장 실거래 수집
                  {leaderTxs.length > 0 && <span className="ml-1 font-normal text-slate-500">({leaderTxs.length}건 보유)</span>}
                </p>
                <TransactionFetcher
                  apartment={leaderApt}
                  existingTransactions={leaderTxs}
                  onImport={(newTxs) => {
                    if (newTxs.length > 0) store.setTransactions([...store.transactions, ...newTxs]);
                  }}
                />
              </div>
            );
          })()}
        </div>

        {/* 비교단지 일괄 실거래 수집 */}
        {store.comparables.length > 0 && (
          <BulkTransactionFetcher
            apartments={store.comparables.filter((a) => {
              const link = store.comparableApartments.find((l) => l.targetApartmentId === activeTargetId && l.apartmentId === a.id);
              return !!link?.selected;
            })}
            existingTransactions={store.transactions}
            onImport={(newTxs) => {
              if (newTxs.length > 0) store.setTransactions([...store.transactions, ...newTxs]);
            }}
          />
        )}

        {/* 비교단지 테이블 - 전체 너비 */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-black">{activeTarget ? activeTarget.name : "대상아파트 없음"}</h2>
          </div>
          <table className="table w-full">
            <thead><tr><th>선택</th><th>단지명</th><th>지역</th><th>입주</th><th>세대수</th><th>가중치</th><th>삭제</th></tr></thead>
            <tbody>
              {store.comparables.map((apartment) => {
                const link = store.comparableApartments.find((item) => item.targetApartmentId === activeTargetId && item.apartmentId === apartment.id);
                return (
                  <tr key={apartment.id}>
                    <td><input type="checkbox" checked={!!link?.selected} onChange={(event) => upsertComparable(apartment.id, event.target.checked)} /></td>
                    <td className="font-semibold">{apartment.name}</td>
                    <td>{apartment.region}</td>
                    <td>{apartment.builtYear ?? "-"}</td>
                    <td>{apartment.households ?? "-"}</td>
                    <td>
                      <input className="input max-w-24" type="number" min="0" max="100" value={link?.compareWeight ?? 20} onChange={(event) => upsertComparable(apartment.id, link?.selected ?? false, Number(event.target.value))} />
                    </td>
                    <td>
                      <button
                        className="btn-danger text-xs"
                        onClick={() => {
                          store.setApartments(store.apartments.filter((a) => a.id !== apartment.id));
                          store.setComparableApartments(store.comparableApartments.filter((item) => item.apartmentId !== apartment.id));
                        }}
                      >삭제</button>
                    </td>
                  </tr>
                );
              })}
              {!store.comparables.length && (
                <tr><td colSpan={7} className="text-center text-slate-500">비교단지가 없습니다. 자동추천 또는 대상아파트 검색으로 추가하세요.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input className="input mt-1" type="number" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
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
