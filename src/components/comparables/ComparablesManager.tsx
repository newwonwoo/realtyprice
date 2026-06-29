"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtyStore } from "@/lib/clientStore";
import { defaultComparableRule } from "@/lib/seed";
import { nowIso } from "@/lib/format";
import { autoLeaderRatio } from "@/lib/locationScore";
import { findLeaderForAddress, LEADER_APARTMENTS } from "@/lib/leaderApartments";
import { isPublicHousing } from "@/lib/publicHousing";
import type { Apartment, ComparableRule } from "@/types/apartment";
import { ComparableSuggestions } from "@/components/comparables/ComparableSuggestions";
import { TransactionFetcher } from "@/components/targets/TransactionFetcher";
import { BulkTransactionFetcher } from "@/components/comparables/BulkTransactionFetcher";

/**
 * 비교단지 관리 (대상아파트 1개 기준) — 추천·선택·가중치·대장 설정·일괄 실거래 수집.
 * /comparables 페이지와 대상 상세페이지(올인원 동선) 양쪽에서 동일하게 사용한다.
 */
export function ComparablesManager({ targetId }: { targetId: string }) {
  const store = useRealtyStore();
  const [removedNotice, setRemovedNotice] = useState<string[]>([]);
  const activeTargetId = targetId;
  const activeTarget = store.targets.find((target) => target.id === activeTargetId)
    ?? store.apartments.find((a) => a.id === activeTargetId);

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

  // 공공임대 비교단지 자동 제거 + 사용자 알림
  // store 데이터가 바뀔 때마다 검사(대상 전환 없이 DB 로드·추천 추가로 새어든 휴먼시아도 잡는다).
  // 제거 후엔 공공임대가 0개 → early return 되므로 무한루프 없음. 대상(target)은 보호.
  useEffect(() => {
    const targetIds = new Set(store.targets.map((t) => t.id));
    const publicApts = store.apartments.filter((a) => isPublicHousing(a.name) && !targetIds.has(a.id));
    if (!publicApts.length) return;
    const publicIds = new Set(publicApts.map((a) => a.id));
    setRemovedNotice(publicApts.map((a) => a.name));
    const linksToRemove = store.comparableApartments.filter((l) => publicIds.has(l.apartmentId));
    if (linksToRemove.length) store.setComparableApartments(store.comparableApartments.filter((l) => !publicIds.has(l.apartmentId)));
    store.setApartments(store.apartments.filter((a) => !publicIds.has(a.id)));
    const timer = setTimeout(() => setRemovedNotice([]), 8000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.apartments, store.comparableApartments, store.targets]);

  // 현재 비교단지 링크들 (이 대상아파트에 해당)
  const currentLinks = store.comparableApartments.filter((item) => item.targetApartmentId === activeTargetId);
  const linkFor = (apartmentId: string) =>
    store.comparableApartments.find((item) => item.targetApartmentId === activeTargetId && item.apartmentId === apartmentId);

  // 가중치 합계 → 합이 100이 아닐 때 경고. 표시되는 비교단지 기준(링크 없으면 기본 20)
  const weightSum = store.comparables.reduce((s, apt) => s + (linkFor(apt.id)?.compareWeight ?? 20), 0);

  // 균등배분: 표시된 비교단지 전체를 100/N으로 리셋. 링크 없는 단지는 새로 생성한다.
  function distributeWeightsEvenly() {
    const comps = store.comparables;
    const n = comps.length;
    if (!n) return;
    const base = Math.floor(100 / n);
    const remainder = 100 - base * n;
    const weightByApt = new Map<string, number>();
    comps.forEach((apt, i) => weightByApt.set(apt.id, base + (i < remainder ? 1 : 0)));

    const next = store.comparableApartments.map((item) => {
      if (item.targetApartmentId !== activeTargetId || !weightByApt.has(item.apartmentId)) return item;
      const w = weightByApt.get(item.apartmentId)!;
      weightByApt.delete(item.apartmentId);
      return { ...item, selected: true, compareWeight: w, updatedAt: nowIso() };
    });
    const created = Array.from(weightByApt.entries()).map(([apartmentId, w]) => ({
      id: `ca_${Date.now()}_${apartmentId}`,
      targetApartmentId: activeTargetId,
      apartmentId,
      selected: true,
      manualAdded: true,
      compareWeight: w,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
    store.setComparableApartments([...next, ...created]);
  }

  function upsertComparable(apartmentId: string, compareWeight?: number) {
    const existing = store.comparableApartments.find((item) => item.targetApartmentId === activeTargetId && item.apartmentId === apartmentId);
    if (existing) {
      store.setComparableApartments(store.comparableApartments.map((item) => item.id === existing.id ? { ...item, selected: true, compareWeight: compareWeight ?? item.compareWeight, updatedAt: nowIso() } : item));
      return;
    }
    const n = currentLinks.length + 1;
    const base = Math.floor(100 / n);
    const remainder = 100 - base * n;
    let idxCounter = 0;
    const updated = store.comparableApartments.map((item) => {
      if (item.targetApartmentId !== activeTargetId) return item;
      const w = base + (idxCounter < remainder ? 1 : 0);
      idxCounter++;
      return { ...item, compareWeight: w, updatedAt: nowIso() };
    });
    store.setComparableApartments([
      ...updated,
      {
        id: `ca_${Date.now()}_${apartmentId}`,
        targetApartmentId: activeTargetId,
        apartmentId,
        selected: true,
        manualAdded: true,
        compareWeight: compareWeight ?? base,
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
    upsertComparable(apt.id);
  }

  const existingComparableIds = new Set(store.apartments.map((a) => a.id));

  // 대장아파트 자동 지정: 대상이 바뀌고 대장이 미설정이면 하드코딩 테이블에서 즉시 적용
  const suggestedLeader = activeTarget ? findLeaderForAddress(activeTarget.address ?? activeTarget.region ?? "") : undefined;

  useEffect(() => {
    if (!activeTarget || !suggestedLeader) return;
    // 이미 대장이 지정돼 있으면(자동·수동 무관) 절대 건드리지 않는다.
    // 비어있을 때만 1회 자동지정. editable 존중.
    if (rule.leaderApartmentId) return;

    const id = `leader_${suggestedLeader.region.replace(/\s/g, "_")}_${suggestedLeader.name.replace(/\s/g, "_")}`;
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

    const ratio = autoLeaderRatio(activeTarget, leaderApt, store.transactions, activeTarget.defaultArea);
    saveRule({ ...rule, leaderApartmentId: id, targetToLeaderRatio: ratio, targetApartmentId: activeTargetId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTargetId]);

  const currentLeaderName = rule.leaderApartmentId
    ? (store.apartments.find((a) => a.id === rule.leaderApartmentId)?.name ?? LEADER_APARTMENTS.find((e) => e.region + "_" + e.name === rule.leaderApartmentId)?.name)
    : undefined;

  if (!activeTarget) {
    return <p className="text-sm text-slate-400">대상아파트를 먼저 선택하세요.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 공공임대 자동 제거 알림 */}
      {removedNotice.length > 0 && (
        <div className="fixed top-4 right-4 z-50 max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg text-sm">
          <p className="font-semibold text-amber-800">공공임대 단지 자동 제거됨</p>
          <p className="text-amber-700 mt-1">{removedNotice.join(", ")}</p>
        </div>
      )}
      {/* 가중치 합계 sticky 배너 */}
      {store.comparables.length > 0 && weightSum !== 100 && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-5 py-2 text-sm rounded-lg">
          <span className="text-amber-800 font-semibold">
            ⚠️ 가중치 합계 {weightSum} — 100이 아닙니다 (상대 비율로 자동 환산됨)
          </span>
          <button className="btn-secondary text-xs px-3 py-1 whitespace-nowrap" onClick={distributeWeightsEvenly}>균등배분</button>
        </div>
      )}

      {/* 필터 조건 — 핵심(거리)은 항상, 나머지는 접이식 */}
      <div className="card p-5">
        <p className="text-sm font-black text-slate-700 mb-3">필터 조건</p>
        <NumberField label="최대 거리(km)" value={rule.maxDistanceKm} onChange={(value) => updateRule("maxDistanceKm", value)} />
        <details className="group mt-3">
          <summary className="flex cursor-pointer select-none items-center justify-between rounded-md py-1.5 text-sm font-semibold text-slate-600 hover:text-blue-600">
            상세 필터 (입주연도 · 세대수 · 면적 · 키워드)
            <span className="text-xs text-slate-400 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="최소 입주연도" value={rule.minBuiltYear ?? ""} onChange={(value) => updateRule("minBuiltYear", value)} />
              <NumberField label="최대 입주연도" value={rule.maxBuiltYear ?? ""} onChange={(value) => updateRule("maxBuiltYear", value)} />
            </div>
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
        </details>
      </div>

      {/* 자동추천 (대장 표시 포함) */}
      <div className="card p-5">
        <ComparableSuggestions
          target={activeTarget}
          existingComparableIds={existingComparableIds}
          onAddComparable={addSuggestedComparable}
        />
      </div>

      {/* 대장아파트 설정 */}
      <div className="card p-5">
        <p className="text-sm font-black text-blue-800">👑 대장아파트 설정</p>
        <p className="mt-1 text-xs text-blue-600">가격 추정 시 spillover 앵커로 사용됩니다. 대장 단지의 실거래도 수집하면 비율이 더 정확해집니다.</p>

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
          apartments={store.comparables.filter((a) =>
            store.comparableApartments.some((l) => l.targetApartmentId === activeTargetId && l.apartmentId === a.id)
          )}
          existingTransactions={store.transactions}
          onImport={(newTxs) => {
            if (newTxs.length > 0) store.setTransactions([...store.transactions, ...newTxs]);
          }}
        />
      )}

      {/* 비교단지 테이블 */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
          <span className="text-sm text-slate-600">
            가중치 합계: <span className={weightSum === 100 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>{weightSum}</span>
            {weightSum !== 100 && <span className="text-amber-500 text-xs ml-1">(합이 100이 아닙니다 — 상대 비율로 자동 환산됩니다)</span>}
          </span>
          {store.comparables.length > 0 && (
            <button className="btn-secondary text-xs px-3 py-1" onClick={distributeWeightsEvenly}>균등배분</button>
          )}
        </div>
        <table className="table w-full">
          <thead><tr><th>단지명</th><th>지역</th><th>입주</th><th>세대수</th><th>가중치</th><th>삭제</th></tr></thead>
          <tbody>
            {store.comparables.map((apartment) => {
              const link = store.comparableApartments.find((item) => item.targetApartmentId === activeTargetId && item.apartmentId === apartment.id);
              return (
                <tr key={apartment.id}>
                  <td className="font-semibold">{apartment.name}</td>
                  <td>{apartment.region}</td>
                  <td>{apartment.builtYear ?? "-"}</td>
                  <td>{apartment.households ?? "-"}</td>
                  <td>
                    {(() => {
                      const w = link?.compareWeight ?? 20;
                      const share = weightSum > 0 ? Math.round((w / weightSum) * 100) : 0;
                      return (
                        <div className="flex items-center gap-2 min-w-[180px]">
                          <input type="range" min="0" max="100" value={w} className="flex-1 accent-blue-600" onChange={(e) => upsertComparable(apartment.id, Number(e.target.value))} />
                          <input className="input w-14 text-center" type="number" min="0" max="100" value={w} onChange={(e) => upsertComparable(apartment.id, Number(e.target.value))} />
                          <span className="text-xs text-slate-400 w-10 text-right tabular-nums">{share}%</span>
                        </div>
                      );
                    })()}
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
              <tr><td colSpan={6} className="text-center text-slate-500">비교단지가 없습니다. 자동추천 또는 대상아파트 검색으로 추가하세요.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
