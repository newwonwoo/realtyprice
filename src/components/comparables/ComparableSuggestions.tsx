"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { nowIso } from "@/lib/format";
import type { AptSearchResult } from "@/app/api/apt-search/route";
import type { SchoolInfo } from "@/app/api/school-info/route";

type Props = {
  target: Apartment;
  existingComparableIds: Set<string>;
  onAddComparable: (apt: Apartment) => void;
};

// 입지(주소 일치) 중심 유사도 스코어링
// 학군·생활인프라 proxy = 행정구역 일치 수준
// 연식은 극히 약한 보조 지표
function similarityScore(target: Apartment, item: AptSearchResult): number {
  let score = 30; // base — 같은 시 이상 일치해야 임계값(50) 통과

  // ── 입지: 주소 행정구역 일치 (최대 50점) ─────────────────────────
  const targetParts = (target.address ?? target.region ?? "").split(" ").filter(Boolean);
  const itemParts = item.address.split(" ").filter(Boolean);

  // 법정동(3번째 토큰) 일치: 같은 생활권
  if (targetParts[2] && itemParts[2] && targetParts[2] === itemParts[2]) {
    score += 50;
  } else if (targetParts[1] && itemParts[1] && targetParts[1] === itemParts[1]) {
    // 같은 구/군: 학군·인프라 상당 부분 겹침
    score += 30;
  } else if (targetParts[0] && itemParts[0] && targetParts[0] === itemParts[0]) {
    // 같은 시: 최소 입지 유사성
    score += 10;
  }

  // ── 세대수: 인프라 규모 proxy (최대 10점) ─────────────────────────
  if (target.households && item.households) {
    const ratio = Math.min(target.households, item.households) / Math.max(target.households, item.households);
    if (ratio >= 0.6) score += 10;
    else if (ratio >= 0.4) score += 5;
  }

  // ── 연식: 아주 약한 페널티만 (최대 -10점) ────────────────────────
  const itemYear = item.builtDate ? parseInt(item.builtDate.slice(0, 4), 10) : 0;
  if (target.builtYear && itemYear) {
    const diff = Math.abs(target.builtYear - itemYear);
    if (diff > 20) score -= 10;
    else if (diff > 15) score -= 5;
    // 15년 이내 차이는 패널티 없음
  }

  return Math.max(0, score);
}

// 지역별 초등학교 캐시 (시군구 단위)
const schoolCache: Record<string, SchoolInfo[]> = {};

export function ComparableSuggestions({ target, existingComparableIds, onAddComparable }: Props) {
  const [suggestions, setSuggestions] = useState<AptSearchResult[]>([]);
  // 주소(구 단위) → 초등학교 목록 매핑
  const [schoolMap, setSchoolMap] = useState<Record<string, SchoolInfo[]>>({});
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

    const regionKeyword = target.region.split(" ").slice(0, 2).join(" ");

    setLoading(true);
    setError("");
    setOpen(true);
    setSuggestions([]);

    try {
      const params = new URLSearchParams({ serviceKey, keyword: regionKeyword });
      const res = await fetch(`/api/apt-search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "오류가 발생했습니다."); return; }

      const items: AptSearchResult[] = json.items ?? [];
      const filtered = items
        .filter((item) => item.name !== target.name && item.name !== target.shortName)
        .map((item) => ({ item, score: similarityScore(target, item) }))
        .filter(({ score }) => score >= 55)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
        .map(({ item }) => item);

      if (!filtered.length) {
        setError("유사한 비교단지 후보를 찾지 못했습니다.");
        return;
      }
      setSuggestions(filtered);

      // 고유 구 단위로 초등학교 일괄 조회
      const uniqueGus = Array.from(
        new Set(filtered.map((item) => item.address.split(" ").slice(0, 3).join(" ")))
      );
      const newMap: Record<string, SchoolInfo[]> = { ...schoolCache };
      await Promise.all(
        uniqueGus.map(async (gu) => {
          if (newMap[gu]) return; // 캐시 히트
          try {
            const r = await fetch(`/api/school-info?address=${encodeURIComponent(gu)}`);
            const d = await r.json();
            newMap[gu] = d.schools ?? [];
            schoolCache[gu] = newMap[gu];
          } catch {
            newMap[gu] = [];
          }
        })
      );
      setSchoolMap(newMap);

      // 학교 수 반영해서 재정렬 (같은 입지 점수면 학교 많은 순)
      setSuggestions((prev) =>
        [...prev].sort((a, b) => {
          const ga = newMap[a.address.split(" ").slice(0, 3).join(" ")]?.length ?? 0;
          const gb = newMap[b.address.split(" ").slice(0, 3).join(" ")]?.length ?? 0;
          const sa = similarityScore(target, a) + (ga >= 5 ? 5 : ga >= 3 ? 2 : 0);
          const sb = similarityScore(target, b) + (gb >= 5 ? 5 : gb >= 3 ? 2 : 0);
          return sb - sa;
        })
      );
    } catch (e) {
      setError(`요청 실패: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function getSchoolCount(item: AptSearchResult): number {
    const gu = item.address.split(" ").slice(0, 3).join(" ");
    return schoolMap[gu]?.length ?? 0;
  }

  function handleAdd(item: AptSearchResult) {
    const apt: Apartment = {
      id: `cpk_${item.complexPk}`,
      name: item.name,
      region: item.address.split(" ").slice(0, 2).join(" "),
      address: item.address,
      role: "comparable",
      group: "auto_suggested",
      builtYear: item.builtDate ? parseInt(item.builtDate.slice(0, 4), 10) : undefined,
      households: item.households || undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    onAddComparable(apt);
    setAdded((prev) => { const next = new Set(prev); next.add(item.complexPk); return next; });
  }

  return (
    <div>
      <button className="btn-primary w-full" onClick={fetchSuggestions} disabled={loading}>
        {loading ? "추천 단지 검색 중…" : "비교단지 자동추천 (공공데이터)"}
      </button>

      {open && (
        <div className="mt-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="font-bold text-sm">자동추천 비교단지</p>
              <p className="text-xs text-slate-500">{target.region} 내 입지(생활권·학군) 유사 단지 (입지 우선 정렬)</p>
            </div>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>✕</button>
          </div>

          {error && <p className="p-4 text-sm text-red-600">{error}</p>}

          {suggestions.length > 0 && (
            <>
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                <p className="text-xs text-amber-700">
                  <span className="font-bold">초교</span>: 같은 구 내 초등학교 수(학군 참고용) &nbsp;|&nbsp;
                  <span className="font-bold">역세권</span>: 단지 상세페이지(대상아파트)에서 확인
                </p>
              </div>
              <table className="table w-full">
                <thead>
                  <tr><th>단지명</th><th>세대</th><th>준공</th><th>초교</th><th></th></tr>
                </thead>
                <tbody>
                  {suggestions.map((item) => {
                    const alreadyAdded = added.has(item.complexPk) || existingComparableIds.has(`cpk_${item.complexPk}`);
                    const schoolCount = getSchoolCount(item);
                    return (
                      <tr key={item.complexPk}>
                        <td className="font-semibold text-sm">{item.name}</td>
                        <td className="text-right text-sm">{item.households ? item.households.toLocaleString() : "-"}</td>
                        <td className="text-sm">{item.builtDate ? item.builtDate.slice(0, 4) : "-"}</td>
                        <td className="text-sm">
                          {schoolCount > 0
                            ? <span className={`font-semibold ${schoolCount >= 5 ? "text-blue-600" : "text-slate-600"}`}>{schoolCount}개</span>
                            : <span className="text-slate-300">-</span>
                          }
                        </td>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
