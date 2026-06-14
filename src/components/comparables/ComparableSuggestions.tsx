"use client";

import { useState } from "react";
import type { Apartment } from "@/types/apartment";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { nowIso } from "@/lib/format";
import type { AptSearchResult } from "@/app/api/apt-search/route";
import type { SchoolDistrictResult } from "@/app/api/school-district/route";

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

// 두 좌표 간 거리(m) — Haversine
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 입지 등급 절대 점수 (주소 tier 키워드 + 브랜드 + 세대수 + 연식)
function locationGradeScore(addr: string, name: string, households?: number, builtYear?: number): number {
  const text = `${addr} ${name}`;
  let s = 50;
  if (/강남|서초|송파|용산|성수|한남|여의도|판교|과천|분당|광교|송도/i.test(text)) s += 16;
  if (/역|초역세권/i.test(text)) s += 6;
  if (/래미안|자이|디에이치|아크로|힐스테이트|푸르지오|아이파크|롯데캐슬|센트럴|더샵|포레나/i.test(text)) s += 4;
  if ((households ?? 0) >= 1500) s += 8;
  else if ((households ?? 0) >= 1000) s += 5;
  const yr = builtYear ?? 0;
  const now = new Date().getFullYear();
  if (yr >= now - 5) s += 6;
  else if (yr && yr < now - 20) s -= 6;
  return Math.min(100, Math.max(0, s));
}

// 대상 대비 상대 입지등급 (diff = 비교단지 - 대상)
function tierFromDiff(diff: number): { label: string; cls: string } {
  if (diff >= 8) return { label: "상급지", cls: "bg-purple-100 text-purple-700" };
  if (diff <= -8) return { label: "하급지", cls: "bg-slate-100 text-slate-500" };
  return { label: "동급지", cls: "bg-emerald-100 text-emerald-700" };
}

const ADJACENCY_M = 1000; // 인접 기준: 반경 1km
const HOUSEHOLD_FLOOR = 0.8; // 세대수 하한: 대상의 80% (−20% 초과 축소 시 제외, +는 허용)

// 단지명 → 학군 캐시
const districtCache: Record<string, SchoolDistrictResult | null> = {};

export function ComparableSuggestions({ target, existingComparableIds, onAddComparable }: Props) {
  const [suggestions, setSuggestions] = useState<AptSearchResult[]>([]);
  // 단지명 → 학군 정보
  const [districtMap, setDistrictMap] = useState<Record<string, SchoolDistrictResult | null>>({});
  const [distMap, setDistMap] = useState<Record<string, number>>({}); // complexPk → 거리(m)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [distApplied, setDistApplied] = useState(false); // 1km 필터 적용 여부

  const targetGrade = locationGradeScore(target.address ?? target.region ?? "", target.name, target.households, target.builtYear);

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
      // 1차: 입지 유사도 + 세대수 −20% 하한 필터 (비교단지가 대상의 80% 미만이면 제외, +는 허용)
      const ranked = items
        .filter((item) => item.name !== target.name && item.name !== target.shortName)
        .filter((item) => {
          if (target.households && item.households) {
            return item.households >= target.households * HOUSEHOLD_FLOOR;
          }
          return true; // 세대수 미상이면 통과
        })
        .map((item) => ({ item, score: similarityScore(target, item) }))
        .filter(({ score }) => score >= 55)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40)
        .map(({ item }) => item);

      // 단지별 학군(배정초교) 일괄 조회 — 학구도 공공데이터(data.go.kr). 카카오 불필요.
      // 학교 좌표(schoolLat/schoolLng)를 단지 위치 proxy로 활용해 1km 인접을 측정한다.
      const newMap: Record<string, SchoolDistrictResult | null> = { ...districtCache };
      await Promise.all(
        ranked.map(async (item) => {
          if (item.name in newMap) return;
          try {
            const r = await fetch(`/api/school-district?aptName=${encodeURIComponent(item.name)}&address=${encodeURIComponent(item.address.split(" ").slice(0, 3).join(" "))}`);
            const d = await r.json();
            newMap[item.name] = d.error ? null : (d as SchoolDistrictResult);
            districtCache[item.name] = newMap[item.name];
          } catch {
            newMap[item.name] = null;
          }
        })
      );
      setDistrictMap(newMap);

      // 대상 기준 좌표: 대상 좌표 우선, 없으면 대상의 배정초교 좌표
      let refLat = target.latitude;
      let refLng = target.longitude;
      if ((!refLat || !refLng)) {
        try {
          const tr = await fetch(`/api/school-district?aptName=${encodeURIComponent(target.name)}&address=${encodeURIComponent((target.address ?? target.region ?? "").split(" ").slice(0, 3).join(" "))}`);
          const td = await tr.json();
          if (!td.error && td.schoolLat && td.schoolLng) { refLat = td.schoolLat; refLng = td.schoolLng; }
        } catch { /* 좌표 미상 */ }
      }

      // 1km 인접 필터 — 배정초교 좌표 proxy 기반 (카카오 키 불필요)
      const newDistMap: Record<string, number> = {};
      const canDistance = !!(refLat && refLng);
      let filtered = ranked;
      if (canDistance) {
        for (const item of ranked) {
          const d = newMap[item.name];
          if (d?.schoolLat && d?.schoolLng) {
            newDistMap[item.complexPk] = haversineM(refLat!, refLng!, d.schoolLat, d.schoolLng);
          }
        }
        // 거리가 측정된 단지는 1km 이내만, 학교좌표 미상 단지는 보수적으로 유지
        filtered = ranked.filter((item) => {
          const dist = newDistMap[item.complexPk];
          return dist === undefined || dist <= ADJACENCY_M;
        });
      }
      filtered = filtered.slice(0, 25);
      setDistMap(newDistMap);
      setDistApplied(canDistance);

      if (!filtered.length) {
        setError(canDistance ? "반경 1km 이내 유사 비교단지 후보를 찾지 못했습니다." : "유사한 비교단지 후보를 찾지 못했습니다.");
        return;
      }
      setSuggestions(filtered);

      // 재정렬: 동급지(입지등급 유사) 우선 → 학군 신입생 → 입지 유사도
      setSuggestions((prev) =>
        [...prev].sort((a, b) => {
          const gradeDiffA = Math.abs(locationGradeScore(a.address, a.name, a.households, a.builtDate ? parseInt(a.builtDate.slice(0, 4), 10) : undefined) - targetGrade);
          const gradeDiffB = Math.abs(locationGradeScore(b.address, b.name, b.households, b.builtDate ? parseInt(b.builtDate.slice(0, 4), 10) : undefined) - targetGrade);
          const na = newMap[a.name]?.newStudents ?? 0;
          const nb = newMap[b.name]?.newStudents ?? 0;
          // 동급지 가중치를 크게 — |등급차|가 작을수록 상위
          const sa = similarityScore(target, a) - gradeDiffA * 3 + (na >= 100 ? 8 : na >= 50 ? 4 : na >= 30 ? 2 : 0);
          const sb = similarityScore(target, b) - gradeDiffB * 3 + (nb >= 100 ? 8 : nb >= 50 ? 4 : nb >= 30 ? 2 : 0);
          return sb - sa;
        })
      );
    } catch (e) {
      setError(`요청 실패: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function getDistrict(item: AptSearchResult): SchoolDistrictResult | null {
    return districtMap[item.name] ?? null;
  }

  async function handleAdd(item: AptSearchResult) {
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

    // 배정초교 좌표를 단지 위치 proxy로 저장 (인접거리 계산용 — 카카오 불필요)
    const district = districtMap[item.name];
    if (district?.schoolLat && district?.schoolLng) {
      apt.latitude = district.schoolLat;
      apt.longitude = district.schoolLng;
    }

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
              <p className="text-xs text-slate-500">
                {target.region} · 입지등급(상/동/하급지) 분류 · 세대수 −20% 이상만
                {distApplied ? " · 반경 1km 이내(배정초교 좌표 기준)" : " · 거리기준 미적용(배정초교 좌표 없음)"}
              </p>
            </div>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>✕</button>
          </div>

          {error && <p className="p-4 text-sm text-red-600">{error}</p>}

          {suggestions.length > 0 && (
            <>
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
                <p className="text-xs text-blue-700">
                  <span className="font-bold">학군</span>: 학구도 공공데이터(2025) 기반 배정 초등학교 &nbsp;|&nbsp;
                  <span className="font-bold">신입생</span>: 학년별 신입생 수(학군 인기도 proxy)
                </p>
              </div>
              <table className="table w-full">
                <thead>
                  <tr><th>단지명</th><th>등급</th><th>거리</th><th>세대</th><th>준공</th><th>배정초교</th><th>신입생</th><th></th></tr>
                </thead>
                <tbody>
                  {suggestions.map((item) => {
                    const alreadyAdded = added.has(item.complexPk) || existingComparableIds.has(`cpk_${item.complexPk}`);
                    const district = getDistrict(item);
                    const itemYear = item.builtDate ? parseInt(item.builtDate.slice(0, 4), 10) : undefined;
                    const tier = tierFromDiff(locationGradeScore(item.address, item.name, item.households, itemYear) - targetGrade);
                    const dist = distMap[item.complexPk];
                    return (
                      <tr key={item.complexPk}>
                        <td className="font-semibold text-sm">{item.name}</td>
                        <td><span className={`rounded px-1.5 py-0.5 text-xs font-bold ${tier.cls}`}>{tier.label}</span></td>
                        <td className="text-sm whitespace-nowrap text-slate-500">{dist !== undefined ? (dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`) : "-"}</td>
                        <td className="text-right text-sm">{item.households ? item.households.toLocaleString() : "-"}</td>
                        <td className="text-sm">{item.builtDate ? item.builtDate.slice(0, 4) : "-"}</td>
                        <td className="text-sm max-w-[120px]">
                          {district
                            ? <span className="text-slate-700 truncate block">{district.schoolName.replace(/^서울|^경기|^부산|^인천|^대구|^대전|^광주|^울산/, "")}</span>
                            : <span className="text-slate-300">-</span>
                          }
                        </td>
                        <td className="text-sm whitespace-nowrap">
                          {district ? (
                            <span className={`font-bold ${district.newStudents >= 100 ? "text-blue-600" : district.newStudents >= 50 ? "text-slate-700" : "text-slate-400"}`}>
                              {district.newStudents}명
                            </span>
                          ) : <span className="text-slate-300">-</span>}
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
