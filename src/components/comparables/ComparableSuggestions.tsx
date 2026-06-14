"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { nowIso } from "@/lib/format";
import type { AptSearchResult } from "@/app/api/apt-search/route";

type Props = {
  target: Apartment;
  existingComparableIds: Set<string>;
  onAddComparable: (apt: Apartment) => void;
};

function similarityScore(target: Apartment, item: AptSearchResult): number {
  let score = 100;
  const itemYear = item.builtDate ? parseInt(item.builtDate.slice(0, 4), 10) : 0;

  if (target.builtYear && itemYear) {
    const diff = Math.abs(target.builtYear - itemYear);
    if (diff > 10) score -= 40;
    else if (diff > 7) score -= 25;
    else if (diff > 5) score -= 15;
    else if (diff > 3) score -= 5;
  }

  if (target.households && item.households) {
    const ratio = item.households / target.households;
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

    // 지역명(앞 두 단어)으로 검색
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
        .filter(({ score }) => score >= 50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(({ item }) => item);

      if (!filtered.length) {
        setError("유사한 비교단지 후보를 찾지 못했습니다.");
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
              <p className="text-xs text-slate-500">{target.region} 내 준공연도·세대수 유사 단지 (유사도 순)</p>
            </div>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>✕</button>
          </div>

          {error && <p className="p-4 text-sm text-red-600">{error}</p>}

          {suggestions.length > 0 && (
            <table className="table w-full">
              <thead>
                <tr><th>단지명</th><th>세대</th><th>준공</th><th></th></tr>
              </thead>
              <tbody>
                {suggestions.map((item) => {
                  const alreadyAdded = added.has(item.complexPk) || existingComparableIds.has(`cpk_${item.complexPk}`);
                  return (
                    <tr key={item.complexPk}>
                      <td className="font-semibold text-sm">{item.name}</td>
                      <td className="text-right text-sm">{item.households ? item.households.toLocaleString() : "-"}</td>
                      <td className="text-sm">{item.builtDate ? item.builtDate.slice(0, 4) : "-"}</td>
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
