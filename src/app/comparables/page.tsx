"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRealtyStore } from "@/lib/clientStore";
import { defaultComparableRule } from "@/lib/seed";
import { nowIso } from "@/lib/format";
import type { Apartment, ComparableRule } from "@/types/apartment";
import { ComparableSuggestions } from "@/components/comparables/ComparableSuggestions";

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

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Comparables</p>
        <h1 className="text-3xl font-black">비교단지 관리</h1>
        <p className="mt-2 text-slate-600">비교단지는 대상아파트별로 선택/제외하고 가중치를 따로 저장합니다.</p>
      </div>

      <div className="flex flex-col gap-5">
        {/* 상단: 설정 영역 - 3열 그리드 */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* 1열: 대상아파트 선택 + 자동추천 */}
          <div className="card p-5">
            <label className="text-sm font-bold text-slate-700" htmlFor="target">대상아파트</label>
            <select id="target" className="input mt-2" value={activeTargetId} onChange={(event) => setTargetId(event.target.value)}>
              {store.targets.map((target) => <option key={target.id} value={target.id}>{target.shortName ?? target.name}</option>)}
            </select>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="선택 단지" value={`${selectedCount}개`} />
              <Metric label="후보 단지" value={`${store.comparables.length}개`} />
            </div>
            {activeTarget && (
              <div className="mt-4">
                <ComparableSuggestions
                  target={activeTarget}
                  existingComparableIds={existingComparableIds}
                  onAddComparable={addSuggestedComparable}
                />
              </div>
            )}
          </div>

          {/* 2열: 대장아파트 설정 */}
          <div className="card p-5">
            <p className="text-sm font-black text-blue-800">대장아파트 설정</p>
            <p className="mt-1 text-xs text-blue-600">인근 지하철역 1~2개 거리 내 역 최근접 + 거래량 최다 단지. 가격 추정 시 spillover 앵커로 사용됩니다.</p>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-700">대장아파트 선택</span>
              <select
                className="input mt-1"
                value={rule.leaderApartmentId ?? ""}
                onChange={(e) => saveRule({ ...rule, leaderApartmentId: e.target.value || undefined, targetApartmentId: activeTargetId })}
              >
                <option value="">-- 미설정 --</option>
                {store.apartments.filter((a) => a.id !== activeTargetId).map((a) => (
                  <option key={a.id} value={a.id}>{a.shortName ?? a.name}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
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
              <p className="mt-1 text-xs text-slate-400">미입력 시 기본값 90% 적용</p>
            </label>
          </div>

          {/* 3열: 필터 조건 */}
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

        {/* 하단: 비교단지 테이블 - 전체 너비 */}
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
