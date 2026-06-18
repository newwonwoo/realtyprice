"use client";

import { useParams } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { ExternalLinks } from "@/components/targets/ExternalLinks";
import { TransactionFetcher } from "@/components/targets/TransactionFetcher";
import { AptDetailInfo } from "@/components/targets/AptDetailInfo";
import { formatEok, formatPercent } from "@/lib/format";
import { useRealtyStore } from "@/lib/clientStore";
import { defaultModelWeights } from "@/lib/seed";
import { estimatePrice, regionProfileFromAddress } from "@/lib/priceModel";
import { median } from "@/lib/inventory";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { findSggCode } from "@/data/regionCodes";
import type { ModelWeights } from "@/types/model";
import type { SupplyVolumeResult } from "@/app/api/supply-volume/route";

const conclusionLabel: Record<string, string> = {
  strong_up: "강한 상승예상",
  up: "상승예상",
  neutral: "보합",
  weak: "약세주의",
  price_cut_needed: "매각가 조정 필요",
  insufficient_data: "데이터 부족",
};
const conclusionColor: Record<string, string> = {
  strong_up: "text-emerald-700",
  up: "text-blue-700",
  neutral: "text-slate-700",
  weak: "text-amber-700",
  price_cut_needed: "text-red-700",
  insufficient_data: "text-slate-400",
};

export default function TargetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const store = useRealtyStore();
  const [estimating, setEstimating] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const [selectedArea, setSelectedArea] = useState<number | null>(null);
  const [supplyCliffMode, setSupplyCliffMode] = useState(false);
  const [supplyVolume, setSupplyVolume] = useState<SupplyVolumeResult | null>(null);
  const [supplyLoading, setSupplyLoading] = useState(false);
  const [editingMoveIn, setEditingMoveIn] = useState(false);
  const [moveInInput, setMoveInInput] = useState("");

  const apartment = store.targets.find((item) => item.id === id);
  const latestEstimate = store.priceEstimates.find((item) => item.targetApartmentId === id);
  const selectedLinks = store.comparableApartments.filter((item) => item.targetApartmentId === id && item.selected);
  const selectedComparableIds = selectedLinks.map((item) => item.apartmentId);
  const selectedComparables = store.apartments.filter((item) => selectedComparableIds.includes(item.id));
  const targetListings = store.listings.filter((item) => item.apartmentId === id);
  const targetTransactions = store.transactions.filter((item) => item.apartmentId === id);
  const comparableTransactions = store.transactions.filter((item) => selectedComparableIds.includes(item.apartmentId));
  const comparableListings = store.listings.filter((item) => selectedComparableIds.includes(item.apartmentId));
  const comparableWeights = Object.fromEntries(selectedLinks.map((item) => [item.apartmentId, item.compareWeight || 1]));
  const inventorySignal = store.inventorySignals.find((item) => item.apartmentId === id);
  const rule = store.comparableRules.find((item) => item.targetApartmentId === id);
  const leaderApartment = rule?.leaderApartmentId ? store.apartments.find((a) => a.id === rule.leaderApartmentId) : undefined;
  const leaderTransactions = rule?.leaderApartmentId
    ? store.transactions.filter((tx) => tx.apartmentId === rule.leaderApartmentId && (tx.transactionType === "sale" || tx.transactionType === "presale"))
    : [];
  const areaOptions = useMemo(() => {
    const areas = [apartment?.defaultArea, ...targetTransactions.map((tx) => tx.exclusiveArea), ...targetListings.map((listing) => listing.exclusiveArea)]
      .filter((area): area is number => !!area && area > 0)
      .map((area) => Math.round(area * 10) / 10);
    return Array.from(new Set(areas)).sort((a, b) => a - b);
  }, [apartment?.defaultArea, targetListings, targetTransactions]);
  const effectiveArea = selectedArea ?? apartment?.defaultArea ?? areaOptions[0] ?? 84;
  const matchingComparableListingCount = comparableListings.filter((listing) => Math.abs(listing.exclusiveArea - effectiveArea) / effectiveArea <= 0.03).length;
  const locationFetchRef = useRef<Set<string>>(new Set());

  // 입주물량 자동조회 (단지 변경 시 또는 수동 새로고침)
  async function fetchSupplyVolume() {
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const serviceKey = keys.find((k) => k.provider === "data_go_kr")?.value;
    if (!serviceKey || !apartment) return;
    const lawdCd = findSggCode(apartment.region);
    if (!lawdCd) return;
    setSupplyLoading(true);
    const params = new URLSearchParams({ serviceKey, lawdCd, regionName: apartment.region });
    if (apartment.expectedMoveInYm) params.set("targetMoveInYm", apartment.expectedMoveInYm);
    try {
      const res = await fetch(`/api/supply-volume?${params.toString()}`);
      if (res.ok) setSupplyVolume(await res.json());
    } finally {
      setSupplyLoading(false);
    }
  }

  useEffect(() => {
    fetchSupplyVolume();
  }, [apartment?.id, apartment?.expectedMoveInYm]); // eslint-disable-line react-hooks/exhaustive-deps

  // 위경도 있는 아파트(대상+비교단지) 중 locationFeatures 없거나 24시간 초과 시 자동 조회
  useEffect(() => {
    const toFetch = [apartment, ...selectedComparables].filter((apt): apt is NonNullable<typeof apt> => {
      if (!apt?.latitude || !apt?.longitude) return false;
      if (locationFetchRef.current.has(apt.id)) return false;
      const fetched = apt.locationFeatures?.fetchedAt;
      if (fetched && Date.now() - new Date(fetched).getTime() < 24 * 60 * 60 * 1000) return false;
      return true;
    });
    if (toFetch.length === 0) return;

    toFetch.forEach((apt) => {
      locationFetchRef.current.add(apt.id);
      fetch(`/api/location-score?lat=${apt.latitude}&lng=${apt.longitude}`)
        .then((r) => r.json())
        .then((features) => {
          if (features.error) return;
          const updated = store.apartments.map((a) =>
            a.id === apt.id ? { ...a, locationFeatures: features } : a
          );
          store.setApartments(updated);
        })
        .catch(() => { /* 조용히 실패 */ });
    });
  }, [apartment?.id, selectedComparableIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const locationPremiumRate = calculateLocationPremium(apartment);
  const comparableGradeAnalysis = calculateComparableGradeAnalysis(apartment, selectedComparables);

  // ── 조작 동선 단계 체크 ─────────────────────────────────────────
  const steps = [
    { label: "대상아파트 선정", done: true },
    { label: `비교단지 선택 (${selectedComparables.length}개)`, done: selectedComparables.length > 0, href: "/comparables" },
    { label: `실거래 수집 (${targetTransactions.length + comparableTransactions.length}건)`, done: targetTransactions.length + comparableTransactions.length > 0 },
    { label: `호가 수집 (${targetListings.length}건)`, done: targetListings.length > 0, href: "/listings" },
    { label: "가격 추정 실행", done: !!latestEstimate },
  ];
  const currentStep = steps.findIndex((s) => !s.done);
  const allReady = steps.slice(0, 4).every((s) => s.done);

  if (!apartment) {
    return <AppShell><div className="card p-6">대상아파트를 찾을 수 없습니다.</div></AppShell>;
  }

  async function runEstimate() {
    setEstimating(true);
    setJustDone(false);
    await new Promise((r) => setTimeout(r, 400)); // 진행 표시용 딜레이
    const weights = { ...defaultModelWeights, ...readStorage<Partial<ModelWeights>>(STORAGE_KEYS.modelSettings, defaultModelWeights) };
    const targetSaleListings = targetListings.filter((item) => item.listingType === "sale");
    const targetJeonseListings = targetListings.filter((item) => item.listingType === "jeonse");
    const comparableSaleListings = comparableListings.filter((item) => item.listingType === "sale");
    // 모집공고 분양가(청약홈) 우선, 없으면 분양권 전매 실거래 중간값 fallback
    const presaleTxMedian = median(targetTransactions.filter((item) => item.transactionType === "presale").map((item) => item.price));
    const presalePrice = apartment?.originalPresalePrice ?? presaleTxMedian;
    const result = estimatePrice({
      targetApartmentId: id,
      targetSaleTransactions: targetTransactions.filter((item) => item.transactionType === "sale" || item.transactionType === "presale"),
      saleTransactions: comparableTransactions.filter((item) => item.transactionType === "sale" || item.transactionType === "presale"),
      jeonseTransactions: [...comparableTransactions, ...targetTransactions].filter((item) => item.transactionType === "jeonse"),
      saleListings: targetSaleListings,
      comparableSaleListings,
      jeonseListings: [...targetJeonseListings, ...comparableListings.filter((item) => item.listingType === "jeonse")],
      targetArea: effectiveArea,
      locationPremiumRate,
      comparableLocationAdjustments: comparableGradeAnalysis.adjustments,
      comparableMarketPressureRate: comparableGradeAnalysis.marketPressureRate,
      weights,
      lowPriceAbsorptionRate: inventorySignal?.lowPriceAbsorptionRate ?? 0,
      comparableWeights,
      presalePrice,
      leaderTransactions,
      targetToLeaderRatio: rule?.targetToLeaderRatio,
      regionProfile: regionProfileFromAddress(apartment?.address),
      supplyCliffMode,
    });
    store.setPriceEstimates([result, ...store.priceEstimates.filter((item) => item.targetApartmentId !== id)]);
    setEstimating(false);
    setJustDone(true);
    setTimeout(() => setJustDone(false), 5000);
  }

  function importTransactions(newTxs: import("@/types/transaction").Transaction[]) {
    if (newTxs.length > 0) store.setTransactions([...store.transactions, ...newTxs]);
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-semibold text-blue-600">Target detail</p>
          <h1 className="text-3xl font-black">{apartment.name}</h1>
          <p className="mt-2 text-slate-600">{apartment.address}</p>
        </div>
        <div className="flex flex-col gap-2 items-start sm:items-end">
          <ExternalLinks apartmentName={apartment.name} />
          {/* 입주예정년월 빠른 편집 */}
          {editingMoveIn ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const val = moveInInput.replace(/\D/g, "").slice(0, 6);
                if (val.length === 6) {
                  store.setApartments(store.apartments.map((a) => a.id === apartment.id ? { ...a, expectedMoveInYm: val } : a));
                }
                setEditingMoveIn(false);
              }}
            >
              <input
                autoFocus
                type="text"
                maxLength={7}
                placeholder="YYYYMM (예: 202606)"
                className="input w-40 text-sm"
                value={moveInInput}
                onChange={(e) => setMoveInInput(e.target.value)}
              />
              <button type="submit" className="btn-primary text-xs px-3 py-1.5">저장</button>
              <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={() => setEditingMoveIn(false)}>취소</button>
            </form>
          ) : (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              onClick={() => { setMoveInInput(apartment.expectedMoveInYm ?? ""); setEditingMoveIn(true); }}
            >
              입주예정 {apartment.expectedMoveInYm ? `${apartment.expectedMoveInYm.slice(0,4)}.${apartment.expectedMoveInYm.slice(4,6)}` : "미설정"}
              <span className="text-blue-400">✏</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 단계별 진행 동선 ── */}
      <div className="mb-6 card p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {steps.map((step, i) => {
            const isActive = i === currentStep;
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-300">›</span>}
                <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold
                  ${step.done ? "bg-emerald-100 text-emerald-700" : isActive ? "bg-blue-100 text-blue-700 ring-1 ring-blue-400" : "bg-slate-100 text-slate-400"}`}>
                  {step.done ? "✓" : `${i + 1}`} {step.label}
                  {step.href && !step.done && (
                    <a href={step.href} className="underline">→</a>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <AptDetailInfo apartment={apartment} />

      {/* ── 실거래 가져오기 ── */}
      <div className="mt-6">
        <details open={targetTransactions.length === 0} className="card overflow-hidden">
          <summary className="flex cursor-pointer items-center justify-between p-5 font-bold text-slate-700 hover:bg-slate-50">
            <span>실거래 가져오기</span>
            <span className="text-sm font-normal text-slate-500">{targetTransactions.length > 0 ? `${targetTransactions.length + comparableTransactions.length}건 로드됨` : "데이터 없음"}</span>
          </summary>
          <div className="border-t border-slate-100">
            <TransactionFetcher apartment={apartment} existingTransactions={[...targetTransactions, ...comparableTransactions]} onImport={importTransactions} />
          </div>
        </details>
      </div>

      {/* ── 결과 요약 ── */}
      <div className="grid gap-5 lg:grid-cols-4 mt-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">결론</p>
          <p className={`mt-2 text-xl font-black ${latestEstimate ? conclusionColor[latestEstimate.conclusion] : "text-slate-300"}`}>
            {latestEstimate ? conclusionLabel[latestEstimate.conclusion] : "계산 필요"}
          </p>
        </div>
        <Summary label="예상 매매가" value={latestEstimate ? formatEok(latestEstimate.expectedSaleMid) : "-"} />
        <Summary label="권장 매각호가" value={latestEstimate ? formatEok(latestEstimate.recommendedAskingPrice) : "-"} />
        <Summary label="상승가능성 점수" value={latestEstimate ? `${latestEstimate.upsideScore}점` : "-"} title="추세지속·거래속도·입지·공급 등 5개 항목 합산 (0~100점)" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-black">가격추정 실행</h2>
              <p className="mt-1 text-sm text-slate-500">대상·비교단지 실거래/호가를 선택 평형 기준으로 환산하고 입지 보정을 반영합니다.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-xs font-bold text-slate-600">전용면적
                <select className="input ml-2 w-32" value={effectiveArea} onChange={(event) => setSelectedArea(Number(event.target.value))}>
                  {areaOptions.length ? areaOptions.map((area) => <option key={area} value={area}>{area}㎡</option>) : <option value={effectiveArea}>{effectiveArea}㎡</option>}
                </select>
              </label>
              <label
                title="향후 2년 공급량이 정상 수요의 절반 미만인 구조적 공급절벽 지역에 적용. 입지 비중을 낮추고 전세 소진·호가 lock-in 가중을 강화합니다."
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${supplyCliffMode ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500"}`}
              >
                <input type="checkbox" className="sr-only" checked={supplyCliffMode} onChange={(e) => setSupplyCliffMode(e.target.checked)} />
                <span className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${supplyCliffMode ? "bg-orange-400" : "bg-slate-200"}`}>
                  <span className={`block h-3 w-3 rounded-full bg-white shadow transition-transform ${supplyCliffMode ? "translate-x-3" : "translate-x-0"}`} />
                </span>
                공급절벽 모드
              </label>
            <button
              className={`btn-primary relative min-w-[120px] ${!allReady ? "opacity-70" : ""}`}
              onClick={runEstimate}
              disabled={estimating}
            >
              {estimating ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  추정 중…
                </span>
              ) : "가격추정 실행"}
            </button>
            </div>
          </div>

          {/* 완료 메시지 */}
          {justDone && latestEstimate && (
            <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <p className="font-bold text-emerald-800">✓ 가격 추정이 완료되었습니다.</p>
              <p className="mt-1 text-sm text-emerald-700">
                예상 매매가 <strong>{formatEok(latestEstimate.expectedSaleMid)}</strong>
                &nbsp;({formatEok(latestEstimate.expectedSaleMin)} ~ {formatEok(latestEstimate.expectedSaleMax)})
                &nbsp;|&nbsp;신뢰도 {latestEstimate.confidenceScore}점
                &nbsp;|&nbsp;<span className={conclusionColor[latestEstimate.conclusion]}>{conclusionLabel[latestEstimate.conclusion]}</span>
              </p>
              {latestEstimate.warnings?.filter(w => w !== "사라진 매물은 거래완료가 아니라 소진추정입니다.").map((w, i) => (
                <p key={i} className="mt-1 text-xs text-amber-700">⚠ {w}</p>
              ))}
            </div>
          )}

          {!allReady && !justDone && (
            <p className="mt-3 text-xs text-amber-600">
              ⚠ {steps[currentStep]?.label}이 아직 완료되지 않았습니다. 데이터를 보완하면 더 정확한 추정이 가능합니다.
            </p>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Summary label="예상 하단" value={latestEstimate ? formatEok(latestEstimate.expectedSaleMin) : "-"} />
            <Summary label="예상 상단" value={latestEstimate ? formatEok(latestEstimate.expectedSaleMax) : "-"} />
            <Summary label="방어가격" value={latestEstimate ? formatEok(latestEstimate.defensePrice) : "-"} />
            <Summary label="예상 전세가" value={latestEstimate ? formatEok(latestEstimate.expectedJeonseMid) : "-"} />
            <Summary label="급매소진율" value={latestEstimate ? formatPercent(latestEstimate.lowPriceAbsorptionRate) : formatPercent(inventorySignal?.lowPriceAbsorptionRate)} title="호가 목록에서 급매·저가 매물이 얼마나 소진됐는지 비율. 높을수록 상승압력 강함." />
            <Summary label="신뢰도" value={latestEstimate ? `${latestEstimate.confidenceScore}점` : "-"} title="가격앵커 데이터 충분도 (0~100점). 실거래·호가가 많을수록 높아집니다." />
            <Summary label="적용 평형" value={`${latestEstimate?.selectedArea ?? effectiveArea}㎡`} />
          </div>
        </div>

        {latestEstimate && latestEstimate.modelBreakdown.length > 0 && (
          <div className="card p-6 lg:col-span-2">
            <h2 className="text-xl font-black">가격추정 모델 전체</h2>
            <p className="mt-1 text-xs text-slate-500">
              평가요소별로 <b>참조값(가격·거래량 등)</b>, 측정 <b>원점수</b>, 적용 <b>가중치·배점</b>, 최종 <b>결과</b>를 분리해 표시합니다.
              한국 시장 특수성(추세지속·거래속도 선행) 기반.
            </p>

            {/* ── 예상가(매매) 앵커 ── */}
            <div className="mt-5 flex items-baseline justify-between">
              <h3 className="text-base font-black text-slate-700">① 예상가 앵커 (가중평균 → 예상가)</h3>
              <p className="text-sm font-bold text-slate-500">예상가 <span className="text-xl text-slate-900">{formatEok(latestEstimate.expectedSaleMid)}</span></p>
            </div>
            <ModelTable factors={latestEstimate.modelBreakdown.filter((f) => f.group === "price")} resultHeader="환산가" />

            {/* ── 상승가능성 점수 ── */}
            <div className="mt-6 flex items-baseline justify-between">
              <h3 className="text-base font-black text-slate-700">② 상승가능성 점수 (원점수 합산)</h3>
              <p className="text-sm font-bold text-slate-500">합계 <span className="text-xl text-blue-700">{latestEstimate.upsideScore}</span>점 / 100</p>
            </div>
            <ModelTable factors={latestEstimate.modelBreakdown.filter((f) => f.group === "upside")} resultHeader="점수" totalLabel="상승가능성 합계 (최대 100)" totalResult={`${latestEstimate.upsideScore}점`} />

            {leaderApartment && rule?.targetToLeaderRatio && (
              <p className="mt-3 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
                대장아파트 비율: {Math.round(rule.targetToLeaderRatio * 100)}%
                {leaderTransactions.length > 0 ? ` | 대장 실거래 ${leaderTransactions.length}건 반영` : " | 대장 실거래 데이터 없음"}
              </p>
            )}
            {latestEstimate.reasonSummary && latestEstimate.reasonSummary.length > 0 && (
              <div className="mt-4 space-y-1">
                {latestEstimate.reasonSummary.map((r, i) => (
                  <p key={i} className="text-xs text-slate-500">✓ {r}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <DataCard title="선택 비교단지" value={`${selectedComparables.length}개`} description={selectedComparables.map((item) => item.shortName ?? item.name).join(", ") || "비교단지를 선택하세요."} />
        <DataCard title="실거래 입력" value={`${targetTransactions.length + comparableTransactions.length}건`} description="대상·비교단지 매매/분양권/전세 실거래를 선택 평형으로 환산합니다." />
        <DataCard title="비교단지 호가" value={`${comparableListings.length}건`} description={matchingComparableListingCount ? `선택 평형 직접 매칭 ${matchingComparableListingCount}건` : "동일 평형이 없으면 ㎡당가로 환산합니다."} />
        <DataCard title="상·하급지 보정" value={`${Math.round(comparableGradeAnalysis.marketPressureRate * 100)}%`} description={comparableGradeAnalysis.summary} />
        <DataCard title="매물소진 신호" value={inventorySignal ? formatPercent(inventorySignal.lowPriceAbsorptionRate) : "-"} description={inventorySignal?.conclusion === "strong_up" ? "급매·저가매물 소진 30% 이상 — 강한 상승 신호" : "호가/매물 화면에서 산출합니다."} />
        <LocationFeaturesCard apartment={apartment} />
        <SupplyVolumeCard apartment={apartment} data={supplyVolume} loading={supplyLoading} onRefresh={fetchSupplyVolume} latestEstimate={latestEstimate} />
      </div>

    </AppShell>
  );
}

function Summary({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" title={title}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function DataCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}

function ModelTable({
  factors, resultHeader, totalLabel, totalResult,
}: {
  factors: import("@/types/model").ModelFactor[];
  resultHeader: string;
  totalLabel?: string;
  totalResult?: string;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">평가요소</th>
            <th className="px-3 py-2 text-left font-semibold">참조값 (가격·거래량 등)</th>
            <th className="px-3 py-2 text-left font-semibold">원점수 (측정값)</th>
            <th className="px-3 py-2 text-right font-semibold">가중치·배점</th>
            <th className="px-3 py-2 text-right font-semibold">{resultHeader}</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((f, i) => (
            <tr key={i} className={`border-t border-slate-100 ${f.active ? "" : "text-slate-400"}`}>
              <td className="px-3 py-2 font-semibold text-slate-700">{f.label}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{f.source}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{f.rawValue}</td>
              <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">{f.weight}</td>
              <td className={`px-3 py-2 text-right font-bold tabular-nums ${f.active ? "text-slate-900" : "text-slate-400"}`}>{f.result}</td>
            </tr>
          ))}
          {totalLabel && (
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="px-3 py-2 font-black" colSpan={4}>{totalLabel}</td>
              <td className="px-3 py-2 text-right font-black tabular-nums text-blue-800">{totalResult}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


function calculateComparableGradeAnalysis(
  target: import("@/types/apartment").Apartment | undefined,
  comparables: import("@/types/apartment").Apartment[]
) {
  if (!target || comparables.length === 0) {
    return { adjustments: {} as Record<string, number>, marketPressureRate: 0, summary: "선택된 비교단지가 없어 상·하급지 보정을 적용하지 않습니다." };
  }
  const targetScore = locationQualityScore(target);
  const entries = comparables.map((apt) => {
    const diff = locationQualityScore(apt) - targetScore;
    // 약 10점 차이를 1% 가격 차이로 보고, 개별 비교단지 보정은 ±12%로 제한합니다.
    const adjustmentRate = Math.min(0.12, Math.max(-0.12, diff / 1000));
    return { apt, adjustmentRate };
  });
  const averageAdjustmentRate = entries.reduce((sum, item) => sum + item.adjustmentRate, 0) / entries.length;
  // 가격압력은 비교가격 환산 보정보다 약하게 둡니다. 상급 비교지는 키 맞추기/전이 기대, 하급 비교지는 눈높이 제약으로 해석합니다.
  const marketPressureRate = Math.min(0.05, Math.max(-0.05, averageAdjustmentRate / 2));
  const superiorCount = entries.filter((item) => item.adjustmentRate > 0.015).length;
  const inferiorCount = entries.filter((item) => item.adjustmentRate < -0.015).length;
  const summary = superiorCount > inferiorCount
    ? `상급지 비교단지 ${superiorCount}개가 많아 상승압력을 제한적으로 반영합니다.`
    : inferiorCount > superiorCount
      ? `하급지 비교단지 ${inferiorCount}개가 많아 가격압력을 낮춰 반영합니다.`
      : "비교단지 입지 등급이 대상과 유사해 중립 보정합니다.";

  return {
    adjustments: Object.fromEntries(entries.map((item) => [item.apt.id, item.adjustmentRate])),
    marketPressureRate,
    summary,
  };
}

function SupplyVolumeCard({
  apartment, data, loading, onRefresh, latestEstimate,
}: {
  apartment: import("@/types/apartment").Apartment;
  data: SupplyVolumeResult | null;
  loading: boolean;
  onRefresh: () => void;
  latestEstimate: import("@/types/model").PriceEstimate | undefined;
}) {
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtYm = (ym: string) => ym ? `${ym.slice(0, 4)}년 ${parseInt(ym.slice(4, 6))}월` : "";
  const impactColor = (pct: number) => pct > 0 ? "text-emerald-700" : pct < 0 ? "text-red-700" : "text-slate-600";
  const impactLabel = (pct: number) => pct > 0 ? `공급 희소 +${pct}%` : pct < 0 ? `공급 과다 ${pct}%` : "공급 보통";

  // 입주시점 가격 시뮬레이션: 현재 예상가 × (1 + 입주시점 공급 영향 % - 현재 공급 영향 %)
  const simulatedMoveInPrice = latestEstimate && data?.targetMoveInPriceImpactPct != null
    ? Math.round(latestEstimate.expectedSaleMid * (1 + (data.targetMoveInPriceImpactPct - data.priceImpactPct) / 100))
    : null;

  return (
    <div className="card p-5 lg:col-span-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">입주물량 분석 (국토부 · 2시점)</p>
        <button
          className="text-xs text-blue-600 underline disabled:text-slate-400"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "조회 중…" : "새로고침"}
        </button>
      </div>

      {!data && !loading && (
        <p className="mt-3 text-xs text-amber-600">
          API 키(공공데이터포털) 등록 후 자동 조회됩니다.
          {!apartment.expectedMoveInYm && " 입주예정년월을 단지 정보에 입력하면 미래 시점도 조회합니다."}
        </p>
      )}

      {data && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* 현재시점 */}
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500">현재시점 ({fmtYm(data.current.yyyymm)} 기준 3개월)</p>
            <p className="mt-1 text-2xl font-black">{fmt(data.current.units)}<span className="ml-1 text-sm font-normal text-slate-500">세대</span></p>
            <p className="text-xs text-slate-400">{data.current.complexCount}개 단지 입주</p>
            <p className={`mt-2 text-sm font-bold ${impactColor(data.priceImpactPct)}`}>{impactLabel(data.priceImpactPct)}</p>
          </div>

          {/* 입주시점 */}
          <div className={`rounded-lg border p-4 ${data.targetMoveIn ? "border-blue-200 bg-blue-50/40" : "border-slate-100 bg-slate-50"}`}>
            <p className="text-xs font-bold text-slate-500">
              {apartment.expectedMoveInYm
                ? `입주시점 (${fmtYm(apartment.expectedMoveInYm)} 기준 3개월)`
                : "입주시점 — 미설정"}
            </p>
            {data.targetMoveIn ? (
              <>
                <p className="mt-1 text-2xl font-black">{fmt(data.targetMoveIn.units)}<span className="ml-1 text-sm font-normal text-slate-500">세대</span></p>
                <p className="text-xs text-slate-400">{data.targetMoveIn.complexCount}개 단지 입주</p>
                <p className={`mt-2 text-sm font-bold ${impactColor(data.targetMoveInPriceImpactPct ?? 0)}`}>{impactLabel(data.targetMoveInPriceImpactPct ?? 0)}</p>
                {simulatedMoveInPrice !== null && (
                  <p className="mt-2 text-xs text-blue-700">
                    입주시점 시뮬레이션가: <strong>{formatEok(simulatedMoveInPrice)}</strong>
                    <span className="ml-1 text-slate-400">(다른 요소 고정 · 공급만 조정)</span>
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-400">단지 정보 &gt; 입주예정년월(YYYYMM) 입력 후 새로고침</p>
            )}
          </div>
        </div>
      )}

      {/* 월별 데이터 바 차트 */}
      {data && data.monthlyData.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-slate-400 mb-2">월별 입주물량 (세대)</p>
          <div className="flex items-end gap-1 h-16">
            {data.monthlyData.map((m) => {
              const maxU = Math.max(...data.monthlyData.map((x) => x.units), 1);
              const h = Math.max(4, Math.round((m.units / maxU) * 56));
              const isCurrent = m.yyyymm === data.current.yyyymm;
              const isMoveIn = m.yyyymm === apartment.expectedMoveInYm;
              return (
                <div key={m.yyyymm} className="flex flex-col items-center gap-0.5 flex-1 min-w-0" title={`${fmtYm(m.yyyymm)}: ${fmt(m.units)}세대`}>
                  <div
                    className={`w-full rounded-t ${isMoveIn ? "bg-blue-500" : isCurrent ? "bg-emerald-500" : "bg-slate-200"}`}
                    style={{ height: `${h}px` }}
                  />
                  <span className="text-[9px] text-slate-400 truncate w-full text-center">{m.yyyymm.slice(4)}/{m.yyyymm.slice(2, 4)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded bg-emerald-500" />현재</span>
            {apartment.expectedMoveInYm && <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded bg-blue-500" />입주시점</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function LocationFeaturesCard({ apartment }: { apartment: import("@/types/apartment").Apartment }) {
  const lf = apartment.locationFeatures;
  const hasCoords = apartment.latitude && apartment.longitude;
  const fmt = (m?: number) => m != null ? (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`) : "-";
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-slate-500">입지 자동분석
        {lf?.fetchedAt && <span className="ml-2 text-xs font-normal text-slate-400">(OSM · {new Date(lf.fetchedAt).toLocaleDateString("ko-KR")})</span>}
        {!hasCoords && <span className="ml-2 text-xs font-normal text-amber-500">위경도 미설정</span>}
        {hasCoords && !lf && <span className="ml-2 text-xs font-normal text-slate-400">조회 중…</span>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-slate-400">지하철역</span><br /><span className="font-bold">{fmt(lf?.nearestSubwayM)}</span>{lf?.nearestSubwayName ? ` ${lf.nearestSubwayName}` : ""}</div>
        <div><span className="text-slate-400">대형마트</span><br /><span className="font-bold">{fmt(lf?.nearestMartM)}</span>{lf?.nearestMartName ? ` ${lf.nearestMartName}` : ""}</div>
        <div><span className="text-slate-400">공원</span><br /><span className="font-bold">{fmt(lf?.nearestParkM)}</span>{lf?.nearestParkName ? ` ${lf.nearestParkName}` : ""}</div>
        <div><span className="text-slate-400">수변/산림</span><br /><span className="font-bold">{lf ? [lf.hasWaterfront && "수변", lf.hasForestPark && "산림"].filter(Boolean).join("·") || "없음" : "-"}</span></div>
      </div>
    </div>
  );
}

function locationQualityScore(apartment: import("@/types/apartment").Apartment) {
  const text = `${apartment.address} ${apartment.region} ${apartment.name} ${apartment.brand ?? ""}`;
  let score = 50;

  const lf = apartment.locationFeatures;
  if (lf) {
    // 실거리 기반 역세권 점수
    const sm = lf.nearestSubwayM ?? Infinity;
    if (sm <= 300) score += 22;
    else if (sm <= 500) score += 17;
    else if (sm <= 800) score += 12;
    else if (sm <= 1200) score += 6;
    else if (sm <= 1500) score += 2;
    // 대형마트
    const mm = lf.nearestMartM ?? Infinity;
    if (mm <= 500) score += 7;
    else if (mm <= 1000) score += 4;
    else if (mm <= 2000) score += 1;
    // 공원
    const pm = lf.nearestParkM ?? Infinity;
    if (pm <= 300) score += 8;
    else if (pm <= 800) score += 5;
    else if (pm <= 1500) score += 2;
    // 수변/산림
    if (lf.hasWaterfront) score += 5;
    if (lf.hasForestPark) score += 3;
  } else {
    // locationFeatures 없으면 주소 텍스트 fallback
    if (/역|station|초역세권/i.test(text)) score += 10;
    if (/공원|호수|공세권/i.test(text)) score += 5;
  }

  // 지역 프리미엄 (실거리와 독립)
  if (/강남|서초|송파|용산|성수|한남|여의도|판교|과천|분당|송도/i.test(text)) score += 16;
  if (/초등|초품아|학교/i.test(text)) score += 5;
  if ((apartment.households ?? 0) >= 1500) score += 8;
  else if ((apartment.households ?? 0) >= 1000) score += 5;
  if ((apartment.builtYear ?? 0) >= new Date().getFullYear() - 5) score += 5;
  else if ((apartment.builtYear ?? 0) && (apartment.builtYear ?? 0) < new Date().getFullYear() - 20) score -= 5;
  if (/래미안|자이|디에이치|아크로|힐스테이트|푸르지오|아이파크|롯데캐슬/i.test(text)) score += 4;
  return Math.min(100, Math.max(0, score));
}

function calculateLocationPremium(apartment: import("@/types/apartment").Apartment | undefined) {
  if (!apartment) return 0;
  const text = `${apartment.address} ${apartment.region} ${apartment.brand ?? ""}`;
  let score = 0;

  const lf = apartment.locationFeatures;
  if (lf) {
    const sm = lf.nearestSubwayM ?? Infinity;
    if (sm <= 300) score += 0.04;
    else if (sm <= 500) score += 0.03;
    else if (sm <= 800) score += 0.02;
    else if (sm <= 1200) score += 0.01;
    if ((lf.nearestMartM ?? Infinity) <= 500) score += 0.01;
    if ((lf.nearestParkM ?? Infinity) <= 500) score += 0.01;
    if (lf.hasWaterfront) score += 0.01;
  } else {
    if (/역|station|초역세권/i.test(text)) score += 0.02;
    if (/공원|몰|백화점|병원|호수|공세권/i.test(text)) score += 0.01;
  }

  if (/초등|초품아|학교/i.test(text)) score += 0.01;
  if ((apartment.households ?? 0) >= 1000) score += 0.005;
  if ((apartment.builtYear ?? 0) >= new Date().getFullYear() - 5) score += 0.005;
  return Math.min(0.08, score);
}
