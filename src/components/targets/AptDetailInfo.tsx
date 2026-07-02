"use client";

import { useEffect, useState } from "react";
import type { Apartment } from "@/types/apartment";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import type { AptCombinedInfo } from "@/app/api/apt-info/route";
import type { SchoolDistrictResult } from "@/app/api/school-district/route";
import type { PresaleInfo } from "@/app/api/apt-presale/route";
import { useRealtyStore } from "@/lib/clientStore";
import { formatEok } from "@/lib/format";

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
  const store = useRealtyStore();
  const [info, setInfo] = useState<AptCombinedInfo | null>(null);
  const [district, setDistrict] = useState<SchoolDistrictResult | null>(null);
  const [presaleItems, setPresaleItems] = useState<PresaleInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;
    if (!serviceKey) return;

    // K-apt 단지 상세는 kaptCode가 있는 완공단지만 (cpk_ 검색단지는 청약홈 경로 이용)
    if (kaptCode) {
      setLoading(true);
      fetch(`/api/apt-info?serviceKey=${encodeURIComponent(serviceKey)}&kaptCode=${kaptCode}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.error) setError(json.error);
          else {
            setInfo(json);
            // 브랜드(시공사) 자동 연계 — 비어있을 때만 저장
            const builder = json?.bass?.kaptBcompany as string | undefined;
            if (!apartment.brand && builder) {
              store.setApartments(store.apartments.map((a) => a.id === apartment.id ? { ...a, brand: builder } : a));
            }
          }
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }

    // 청약홈 분양가 자동조회 (kaptCode 유무와 무관 — 검색단지 브랜드 연계 경로)
    const presaleParams = new URLSearchParams({ serviceKey, houseName: apartment.name });
    fetch(`/api/apt-presale?${presaleParams}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.error && json.items?.length) {
          setPresaleItems(json.items);
          const top = json.items[0];
          // 저장된 분양가가 없으면 첫 번째 결과로 자동 저장 + 브랜드(시공사) 자동 연계
          const needsPresale = !apartment.originalPresalePrice && top?.lowestPrice;
          const builder = top?.constructor as string | undefined;
          const needsBrand = !apartment.brand && builder;
          if (needsPresale || needsBrand) {
            const updated = {
              ...apartment,
              ...(needsPresale ? { originalPresalePrice: top.lowestPrice } : {}),
              ...(needsBrand ? { brand: builder } : {}),
            };
            store.setApartments(store.apartments.map((a) => a.id === apartment.id ? updated : a));
          }
        }
      })
      .catch(() => {});

    // 학구 정보 조회 (학구도 로컬 데이터, 좌표 있으면 거리 계산)
    const distParams = new URLSearchParams({
      aptName: apartment.name,
      address: apartment.address ?? apartment.region ?? "",
    });
    if (apartment.latitude) distParams.set("aptLat", String(apartment.latitude));
    if (apartment.longitude) distParams.set("aptLng", String(apartment.longitude));
    fetch(`/api/school-district?${distParams}`)
      .then((r) => r.json())
      .then((json) => { if (!json.error) setDistrict(json); })
      .catch(() => {});
  }, [kaptCode, apartment.name, apartment.address, apartment.region, apartment.latitude, apartment.longitude]);

  if (loading) return <p className="text-xs text-slate-400">단지 정보 로딩 중…</p>;
  // K-apt 상세도 없고 청약홈 분양정보도 없으면 표출할 내용 없음 (수동 추가 등)
  if (!info && !presaleItems.length) {
    return error ? <p className="text-xs text-red-500">{error}</p> : null;
  }

  const { bass, dtl } = info ?? { bass: {}, dtl: {} };
  const subwayText = [dtl.subwayLine, dtl.subwayStation].filter(Boolean).join(" ") || undefined;
  const presale = presaleItems[0];

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-black text-slate-600 uppercase tracking-wide">단지 상세정보</p>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <Row label="도로명주소" value={bass.kaptdoroAddr} />
          <Row label="세대수" value={bass.kaptdaCnt ? `${Number(bass.kaptdaCnt).toLocaleString()}세대` : undefined} />
          <Row label="동수" value={bass.kaptdongCnt ? `${bass.kaptdongCnt}동` : undefined} />
          <Row label="사용승인" value={formatDate(bass.kaptUsedate)} />
          {Boolean(apartment.originalPresalePrice || presale?.lowestPrice) && (
            <div className="border-b border-slate-100 py-1.5 text-sm">
              <span className="text-slate-500 shrink-0">모집공고 분양가</span>
              <div className="mt-0.5 font-semibold flex flex-wrap gap-1 items-center">
                <span className="text-blue-700">
                  {presale?.lowestPrice && presale?.highestPrice && presale.lowestPrice !== presale.highestPrice
                    ? `${formatEok(presale.lowestPrice)} ~ ${formatEok(presale.highestPrice)}`
                    : formatEok(apartment.originalPresalePrice ?? presale?.lowestPrice ?? presale?.highestPrice ?? 0)}
                </span>
                {presale?.recruitPublicNoticeDate && (
                  <span className="text-xs text-slate-400">(공고일 {presale.recruitPublicNoticeDate})</span>
                )}
              </div>
              {/* 평형별 분양가 — 최저~최고 범위만으론 어느 평형이 얼마인지 안 보여서 목록으로 병기 */}
              {presale?.unitPrices && presale.unitPrices.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  {presale.unitPrices.map((u, i) => (
                    <span key={`${u.houseType}-${i}`}>
                      {u.supplyArea ? `${Number(u.supplyArea).toFixed(0)}㎡` : u.houseType} {formatEok(u.price)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <Row label="시공사" value={bass.kaptBcompany || presale?.constructor} />
          <Row label="시행사" value={bass.kaptMgCmp || presale?.developer} />
          <Row label="난방방식" value={bass.heatMethodNm} />
          <Row label="복도유형" value={bass.hallNm} />
        </div>
        <div>
          <Row label="지하철" value={subwayText} />
          <Row label="지하철역 거리" value={formatDist(dtl.subwayDist)} />
          {district && (
            <div className="border-b border-slate-100 py-1.5 text-sm">
              <span className="text-slate-500 shrink-0">배정초등학교</span>
              <div className="mt-0.5 font-semibold flex flex-wrap gap-1 items-center">
                {district.schoolName}
                {district.newStudents > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${district.newStudents >= 100 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    신입생 {district.newStudents}명
                  </span>
                )}
                {district.distanceM !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${district.distanceM <= 400 ? "bg-emerald-100 text-emerald-700" : district.distanceM <= 800 ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500"}`}>
                    {district.distanceM >= 1000 ? `${(district.distanceM / 1000).toFixed(1)}km` : `${district.distanceM}m`}
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
