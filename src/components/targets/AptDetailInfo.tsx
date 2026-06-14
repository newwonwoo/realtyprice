"use client";

import { useEffect, useState } from "react";
import type { Apartment } from "@/types/apartment";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import type { AptCombinedInfo } from "@/app/api/apt-info/route";
import type { SchoolDistrictResult } from "@/app/api/school-district/route";

function kaptCodeFromId(id: string): string | null {
  // 구형: "kapt_A10025967" → "A10025967"
  // cpk_ 형식(한국부동산원 단지고유번호)은 국토교통부 kaptCode와 달라 사용 불가
  if (id.startsWith("kapt_")) return id.slice(5);
  return null;
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value || value === "0" || value.trim() === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}

function formatDate(d?: string) {
  if (!d || d.length < 6) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}${d.length >= 8 ? "." + d.slice(6, 8) : ""}`;
}

function formatDist(m?: string) {
  if (!m) return undefined;
  const n = parseInt(m, 10);
  if (isNaN(n)) return m;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}km` : `${n}m`;
}

export function AptDetailInfo({ apartment }: { apartment: Apartment }) {
  const kaptCode = kaptCodeFromId(apartment.id);
  const [info, setInfo] = useState<AptCombinedInfo | null>(null);
  const [district, setDistrict] = useState<SchoolDistrictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!kaptCode) return;
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;
    if (!serviceKey) return;

    setLoading(true);
    fetch(`/api/apt-info?serviceKey=${encodeURIComponent(serviceKey)}&kaptCode=${kaptCode}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setInfo(json);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    // 학구 정보 조회 (학구도 로컬 데이터)
    fetch(`/api/school-district?aptName=${encodeURIComponent(apartment.name)}&address=${encodeURIComponent(apartment.address ?? apartment.region ?? "")}`)
      .then((r) => r.json())
      .then((json) => { if (!json.error) setDistrict(json); })
      .catch(() => {});
  }, [kaptCode, apartment.name, apartment.address, apartment.region]);

  if (!kaptCode) return null; // 수동 추가 아파트는 단지코드 없음
  if (loading) return <p className="text-xs text-slate-400">단지 정보 로딩 중…</p>;
  if (error) return <p className="text-xs text-red-500">{error}</p>;
  if (!info) return null;

  const { bass, dtl } = info;
  const subwayText = [dtl.subwayLine, dtl.subwayStation].filter(Boolean).join(" ") || undefined;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-black text-slate-600 uppercase tracking-wide">단지 상세정보</p>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <Row label="도로명주소" value={bass.kaptdoroAddr} />
          <Row label="세대수" value={bass.kaptdaCnt ? `${Number(bass.kaptdaCnt).toLocaleString()}세대` : undefined} />
          <Row label="동수" value={bass.kaptdongCnt ? `${bass.kaptdongCnt}동` : undefined} />
          <Row label="사용승인" value={formatDate(bass.kaptUsedate)} />
          <Row label="시공사" value={bass.kaptBcompany} />
          <Row label="시행사" value={bass.kaptMgCmp} />
          <Row label="난방방식" value={bass.heatMethodNm} />
          <Row label="복도유형" value={bass.hallNm} />
        </div>
        <div>
          <Row label="지하철" value={subwayText} />
          <Row label="지하철역 거리" value={formatDist(dtl.subwayDist)} />
          {district && (
            <div className="border-b border-slate-100 py-1.5 text-sm">
              <span className="text-slate-500 shrink-0">배정초등학교</span>
              <div className="mt-0.5 font-semibold">
                {district.schoolName}
                {district.newStudents > 0 && (
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${district.newStudents >= 100 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    신입생 {district.newStudents}명
                  </span>
                )}
              </div>
            </div>
          )}
          <Row label="버스정류장" value={formatDist(dtl.busDist)} />
          <Row label="주차(지하)" value={dtl.parkingCntUnderGnd ? `${Number(dtl.parkingCntUnderGnd).toLocaleString()}대` : undefined} />
          <Row label="주차(지상)" value={dtl.parkingCntOverGnd ? `${Number(dtl.parkingCntOverGnd).toLocaleString()}대` : undefined} />
          <Row label="승강기" value={dtl.elevCnt ? `${dtl.elevCnt}대` : undefined} />
          <Row label="CCTV" value={dtl.cctvCnt ? `${dtl.cctvCnt}대` : undefined} />
          <Row label="건물구조" value={dtl.buildStructure} />
          <Row label="급수방식" value={dtl.drinkWaterMethod} />
          {dtl.convenientFacility && (
            <div className="border-b border-slate-100 py-1.5 text-sm">
              <p className="text-slate-500">편의시설</p>
              <p className="mt-1 font-semibold text-xs leading-relaxed">{dtl.convenientFacility}</p>
            </div>
          )}
          {dtl.educationFacility && (
            <div className="py-1.5 text-sm">
              <p className="text-slate-500">교육시설</p>
              <p className="mt-1 font-semibold text-xs leading-relaxed">{dtl.educationFacility}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
