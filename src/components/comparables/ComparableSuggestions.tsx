"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { findSggCode } from "@/data/regionCodes";
import { nowIso } from "@/lib/format";
import type { AptSearchResult } from "@/app/api/apt-search/route";

type Props = {
  target: Apartment;
  existingComparableIds: Set<string>; // 이미 등록된 비교단지 ID
  onAddComparable: (apt: Apartment) => void;
};

// 대상 아파트와 유사도 점수 계산 (헤도닉 모델: 준공연도 + 세대수 유사성)
function similarityScore(target: Apartment, item: AptSearchResult): number {
  let score = 100;
  const itemYear = item.kaptUsedate ? parseInt(item.kaptUsedate.slice(0, 4), 10) : 0;
  const itemHouseholds = item.kaptdaCnt ? parseInt(item.kaptdaCnt, 10) : 0;

  if (target.builtYear && itemYear) {
    const yearDiff = Math.abs(target.builtYear - itemYear);
    if (yearDiff > 10) score -= 40;
    else if (yearDiff > 7) score -= 25;
    else if (yearDiff > 5) score -= 15;
    else if (yearDiff > 3) score -= 5;
  }

  if (target.households && itemHouseholds) {
    const ratio = itemHouseholds / target.households;
    if (ratio < 0.4 || ratio > 2.5) score -= 30;
    else if (ratio < 0.6 || ratio > 2.0) score -= 15;
    else if (ratio < 0.8 || ratio > 1.5) score -= 5;
  }

  return Math.max(0, score);
}

export function ComparableSuggestions({ target, existingComparableIds, onAddComparable }: Props) {
  const [suggestions, setSuggestions] = useState<AptSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  async function fetchSuggestions() {
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;
    if (!serviceKey) {
      setError("공공데이터포털 API 키가 없습니다. 설정 > API 키 설정에서 등록하세요.");
      setOpen(true);
      return;
    }

    const sggCode = findSggCode(target.region);
    if (!sggCode) {
      setError(`지역코드를 찾을 수 없습니다: "${target.region}". 아파트 지역 정보를 확인하세요.`);
      setOpen(true);
      return;
    }

    setLoading(true);
    setError("");
    setOpen(true);
    setSuggestions([]);

    try {
      const res = await fetch(`/api/apt-search?serviceKey=${encodeURIComponent(serviceKey)}&sggCode=${sggCode}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "오류가 발생했습니다."); return; }

      const items: AptSearchResult[] = json.items ?? [];

      // 자기 자신 제외 + 유사도 정렬
      const filtered = items
        .filter((item) => item.kaptName !== target.name && item.kaptName !== target.shortName)
        .map((item) => ({ item, score: similarityScore(target, item) }))
        .filter(({ score }) => score >= 50) // 유사도 50점 이상만
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(({ item }) => item);

      if (!filtered.length) {
        setError("유사한 비교단지 후보를 찾지 못했습니다. 해당 지역 아파트 정보가 충분하지 않을 수 있습니다.");
        return;
      }
      setSuggestions(filtered);
    } catch (e) {
      setError(`요청 실패: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleAdd(item: AptSearchResult) {
    const builtYear = item.kaptUsedate ? parseInt(item.kaptUsedate.slice(0, 4), 10) : undefined;
    const households = item.kaptdaCnt ? parseInt(item.kaptdaCnt, 10) : undefined;
    const apt: Apartment = {
      id: `kapt_${item.kaptCode}`,
      name: item.kaptName,
      region: target.region,
      address: item.kaptAddr || target.region,
      role: "comparable",
      group: "auto_suggested",
      brand: item.kaptBcompany || undefined,
      builtYear: isNaN(builtYear!) ? undefined : builtYear,
      households: isNaN(households!) ? undefined : households,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    onAddComparable(apt);
    setAdded((prev) => { const next = new Set(prev); next.add(item.kaptCode); return next; });
  }

  return (
    <div>
      <button
        className="btn-primary w-full"
        onClick={fetchSuggestions}
        disabled={loading}
      >
        {loading ? "추천 단지 검색 중…" : "비교단지 자동추천 (공공데이터)"}
      </button>

      {open && (
        <div className="mt-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="font-bold text-sm">자동추천 비교단지</p>
              <p className="text-xs text-slate-500">{target.region} 내 준공연도·세대수 유사 단지 (유사도 순)</p>
            </div>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>✕</button>
          </div>

          {error && <p className="p-4 text-sm text-red-600">{error}</p>}

          {suggestions.length > 0 && (
            <table className="table w-full">
              <thead>
                <tr><th>단지명</th><th>세대</th><th>준공</th><th>시공사</th><th></th></tr>
              </thead>
              <tbody>
                {suggestions.map((item) => {
                  const alreadyAdded = added.has(item.kaptCode) || existingComparableIds.has(`kapt_${item.kaptCode}`);
                  return (
                    <tr key={item.kaptCode}>
                      <td className="font-semibold text-sm">{item.kaptName}</td>
                      <td className="text-right text-sm">{item.kaptdaCnt ? Number(item.kaptdaCnt).toLocaleString() : "-"}</td>
                      <td className="text-sm">{item.kaptUsedate ? item.kaptUsedate.slice(0, 4) : "-"}</td>
                      <td className="text-xs text-slate-500">{item.kaptBcompany || "-"}</td>
                      <td>
                        {alreadyAdded
                          ? <span className="text-xs text-green-600 font-semibold">추가됨</span>
                          : <button className="btn-secondary text-xs" onClick={() => handleAdd(item)}>추가</button>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
