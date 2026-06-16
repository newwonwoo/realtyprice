"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
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
import type { ModelWeights } from "@/types/model";

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
  const isSelfLeader = rule?.leaderApartmentId === id;
  const leaderApartment = isSelfLeader
    ? apartment
    : (rule?.leaderApartmentId ? store.apartments.find((a) => a.id === rule.leaderApartmentId) : undefined);
  // 대상 = 대장이면 자기 실거래를 그대로 사용, ratio는 1.0
  const leaderTransactions = isSelfLeader
    ? targetTransactions.filter((tx) => tx.transactionType === "sale" || tx.transactionType === "presale")
    : (rule?.leaderApartmentId
        ? store.transactions.filter((tx) => tx.apartmentId === rule.leaderApartmentId && (tx.transactionType === "sale" || tx.transactionType === "presale"))
        : []);
  const areaOptions = useMemo(() => {
    const areas = [apartment?.defaultArea, ...targetTransactions.map((tx) => tx.exclusiveArea), ...targetListings.map((listing) => listing.exclusiveArea)]
      .filter((area): area is number => !!area && area > 0)
      .map((area) => Math.round(area * 10) / 10);
    return Array.from(new Set(areas)).sort((a, b) => a - b);
  }, [apartment?.defaultArea, targetListings, targetTransactions]);
  const effectiveArea = selectedArea ?? apartment?.defaultArea ?? areaOptions[0] ?? 84;
  const matchingComparableListingCount = comparableListings.filter((listing) => Math.abs(listing.exclusiveArea - effectiveArea) / effectiveArea <= 0.03).length;
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
      targetToLeaderRatio: isSelfLeader ? 1.0 : rule?.targetToLeaderRatio,
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
        <ExternalLinks apartmentName={apartment.name} />
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
        <Summary label="상승가능성" value={latestEstimate ? `${latestEstimate.upsideScore}점` : "-"} />
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
            <Summary label="저가소진율" value={latestEstimate ? formatPercent(latestEstimate.lowPriceAbsorptionRate) : formatPercent(inventorySignal?.lowPriceAbsorptionRate)} />
            <Summary label="신뢰도" value={latestEstimate ? `${latestEstimate.confidenceScore}점` : "-"} />
            <Summary label="적용 평형" value={`${latestEstimate?.selectedArea ?? effectiveArea}㎡`} />
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-black">산식 구성값</h2>
          <div className="mt-4 space-y-3">
            <Line label="대상단지 실거래가 20%" value={formatEok(latestEstimate?.targetSalePrice)} />
            <Line label="비교단지 보정 실거래가 25%" value={formatEok(latestEstimate?.adjustedComparableSalePrice)} />
            <Line label="비교단지 현재 호가 10%" value={formatEok(latestEstimate?.comparableAskingPrice)} />
            <Line label="대상단지 현재 호가 12%" value={formatEok(latestEstimate?.saleAskingPrice)} />
            <Line label="전세기반 하방가 15%" value={formatEok(latestEstimate?.jeonseFloorPrice)} />
            <Line label="매물소진속도 8%" value={formatEok(latestEstimate?.inventorySignalPrice)} />
            <Line
              label={`대장아파트 앵커 5%${leaderApartment ? ` (${leaderApartment.shortName ?? leaderApartment.name})` : " (미설정)"}`}
              value={formatEok(latestEstimate?.leaderApartmentAnchorPrice)}
              highlight={!!leaderApartment}
            />
            <Line label="분양가 대비 프리미엄 5%" value={formatEok(latestEstimate?.presalePremiumPrice)} />
            <Line label="거시환경 3%" value={formatEok(latestEstimate?.macroSignalPrice) || "미입력"} />
            <Line label={`대상 입지 보정 2% (${Math.round(locationPremiumRate * 100)}%)`} value={formatEok(latestEstimate?.locationPremiumPrice)} />
            <Line label={`비교단지 상·하급지 압력 2% (${Math.round((latestEstimate?.comparableLocationAdjustmentRate ?? comparableGradeAnalysis.marketPressureRate) * 100)}%)`} value={formatEok(latestEstimate?.comparableMarketPressurePrice)} />
          </div>
          {leaderApartment && (
            <p className="mt-3 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
              {isSelfLeader
                ? `대장 = 대상 (비율 100%) | 자체 실거래 ${leaderTransactions.length}건 반영`
                : `대장아파트 비율: ${Math.round((rule?.targetToLeaderRatio ?? 0.9) * 100)}% | ${leaderTransactions.length > 0 ? `대장 실거래 ${leaderTransactions.length}건 반영` : "대장 실거래 데이터 없음 — 하단에서 수집하세요"}`
              }
            </p>
          )}
          {latestEstimate?.reasonSummary && latestEstimate.reasonSummary.length > 0 && (
            <div className="mt-4 space-y-1">
              {latestEstimate.reasonSummary.map((r, i) => (
                <p key={i} className="text-xs text-slate-500">✓ {r}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <DataCard title="선택 비교단지" value={`${selectedComparables.length}개`} description={selectedComparables.map((item) => item.shortName ?? item.name).join(", ") || "비교단지를 선택하세요."} />
        <DataCard title="실거래 입력" value={`${targetTransactions.length + comparableTransactions.length}건`} description="대상·비교단지 매매/분양권/전세 실거래를 선택 평형으로 환산합니다." />
        <DataCard title="비교단지 호가" value={`${comparableListings.length}건`} description={matchingComparableListingCount ? `선택 평형 직접 매칭 ${matchingComparableListingCount}건` : "동일 평형이 없으면 ㎡당가로 환산합니다."} />
        <DataCard title="상·하급지 보정" value={`${Math.round(comparableGradeAnalysis.marketPressureRate * 100)}%`} description={comparableGradeAnalysis.summary} />
        <DataCard title="매물소진 신호" value={inventorySignal ? formatPercent(inventorySignal.lowPriceAbsorptionRate) : "-"} description={inventorySignal?.conclusion === "strong_up" ? "저가매물 소진율 30% 이상 강한 상승 신호" : "호가/매물 화면에서 산출합니다."} />
      </div>

      <div className="mt-6">
        <TransactionFetcher
          apartment={apartment}
          existingTransactions={[...targetTransactions, ...comparableTransactions]}
          onImport={importTransactions}
        />
      </div>

      {/* 대장아파트 실거래 수집 (대상≠대장인 경우에만) */}
      {leaderApartment && !isSelfLeader && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-bold text-blue-700">
            대장아파트 실거래 수집 — {leaderApartment.shortName ?? leaderApartment.name}
            {leaderTransactions.length > 0 && <span className="ml-2 text-xs font-normal text-slate-500">({leaderTransactions.length}건 보유)</span>}
          </p>
          <TransactionFetcher
            apartment={leaderApartment}
            existingTransactions={leaderTransactions}
            onImport={importTransactions}
          />
        </div>
      )}
    </AppShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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

function Line({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b pb-2 text-sm ${highlight ? "border-blue-100" : "border-slate-100"}`}>
      <span className={highlight ? "font-semibold text-blue-700" : "text-slate-600"}>{label}</span>
      <span className={`font-bold ${highlight ? "text-blue-800" : "text-slate-950"}`}>{value}</span>
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

function locationQualityScore(apartment: import("@/types/apartment").Apartment) {
  const text = `${apartment.address} ${apartment.region} ${apartment.name} ${apartment.brand ?? ""}`;
  let score = 50;
  if (/강남|서초|송파|용산|성수|한남|여의도|판교|과천|분당|송도/i.test(text)) score += 16;
  if (/역|station|초역세권/i.test(text)) score += 10;
  if (/초등|초품아|학교/i.test(text)) score += 5;
  if (/공원|몰|백화점|병원|호수|공세권/i.test(text)) score += 5;
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
  if (/역|station|초역세권/i.test(text)) score += 0.02;
  if (/초등|초품아|학교/i.test(text)) score += 0.01;
  if (/공원|몰|백화점|병원|호수|공세권/i.test(text)) score += 0.01;
  if ((apartment.households ?? 0) >= 1000) score += 0.005;
  if ((apartment.builtYear ?? 0) >= new Date().getFullYear() - 5) score += 0.005;
  return Math.min(0.05, score);
}
