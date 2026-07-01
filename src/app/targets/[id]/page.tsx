"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { ExternalLinks } from "@/components/targets/ExternalLinks";
import { UnifiedTransactionFetcher } from "@/components/targets/UnifiedTransactionFetcher";
import { ListingFetcher, type ApartmentWithRole } from "@/components/listings/ListingFetcher";
import { AptDetailInfo } from "@/components/targets/AptDetailInfo";
import { ComparablesManager } from "@/components/comparables/ComparablesManager";
import { SignalWaterfall } from "@/components/charts/SignalWaterfall";
import { PriceTimeline } from "@/components/charts/PriceTimeline";
import { UpsideGauge } from "@/components/charts/UpsideGauge";
import { formatEok, formatPercent } from "@/lib/format";
import { useRealtyStore } from "@/lib/clientStore";
import { defaultModelWeights } from "@/lib/seed";
import { estimatePrice, regionProfileFromAddress, convertMonthlyRentToJeonse } from "@/lib/priceModel";
import { median } from "@/lib/inventory";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { findSggCode } from "@/data/regionCodes";
import type { ModelWeights } from "@/types/model";
import type { Apartment } from "@/types/apartment";
import type { SupplyVolumeResult } from "@/app/api/supply-volume/route";

const conclusionLabel: Record<string, string> = {
  strong_up: "강한 상승예상",
  up: "상승예상",
  neutral: "보합",
  weak: "약세주의",
  price_cut_needed: "매각가 조정 필요",
  insufficient_data: "데이터 부족",
};
const conclusionDesc: Record<string, string> = {
  strong_up: "상승 신호 다수, 매입 긍정적",
  up: "상승 조건 충족",
  neutral: "상승·하락 신호 균형",
  weak: "약세 신호, 매입 주의",
  price_cut_needed: "현 호가 과열, 매각 검토",
  insufficient_data: "데이터를 보완하세요",
};
const conclusionColor: Record<string, string> = {
  strong_up: "text-emerald-700",
  up: "text-blue-700",
  neutral: "text-slate-700",
  weak: "text-amber-700",
  price_cut_needed: "text-red-700",
  insufficient_data: "text-slate-400",
};
// 의미별 1색 원칙: 보합=slate(텍스트색과 일치), 약세=amber, 충돌 제거
const conclusionBg: Record<string, string> = {
  strong_up: "bg-emerald-50 border-emerald-200",
  up: "bg-blue-50 border-blue-200",
  neutral: "bg-slate-50 border-slate-200",
  weak: "bg-amber-50 border-amber-200",
  price_cut_needed: "bg-red-50 border-red-200",
  insufficient_data: "bg-slate-50 border-dashed border-slate-300",
};
// 상승점수 구간색: 0-39 약세(red) / 40-69 중립(amber) / 70-100 강세(emerald)
const upsideScoreColor = (s: number) => (s >= 70 ? "text-emerald-700" : s >= 40 ? "text-amber-600" : "text-red-600");
const upsideScoreHex = (s: number) => (s >= 70 ? "#10b981" : s >= 40 ? "#f59e0b" : "#ef4444");

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
  const [tab, setTab] = useState<"setup" | "analysis" | "model">("setup");

  // 입주시점(없으면 현재) 공급압력이 희소(+3% 이상)면 공급절벽 모드 권장
  const supplyCliffRecommended = (supplyVolume?.targetMoveInPriceImpactPct ?? supplyVolume?.priceImpactPct ?? 0) >= 3;

  const apartment = store.targets.find((item) => item.id === id);
  const latestEstimate = store.priceEstimates.find((item) => item.targetApartmentId === id);
  const selectedLinks = store.comparableApartments.filter((item) => item.targetApartmentId === id);
  const selectedComparableIds = selectedLinks.map((item) => item.apartmentId);
  const selectedComparables = store.apartments.filter((item) => selectedComparableIds.includes(item.id));
  const targetListings = store.listings.filter((item) => item.apartmentId === id);
  const targetTransactions = store.transactions.filter((item) => item.apartmentId === id);
  const comparableTransactions = store.transactions.filter((item) => selectedComparableIds.includes(item.apartmentId));
  const comparableListings = store.listings.filter((item) => selectedComparableIds.includes(item.apartmentId));
  const comparableWeights = Object.fromEntries(selectedLinks.map((item) => [item.apartmentId, item.compareWeight || 1]));
  const inventorySignal = store.inventorySignals.find((item) => item.apartmentId === id);
  const moi = inventorySignal?.monthsOfInventory ?? 0; // 매물 회전속도(재고소진월수)
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

  // ── 수집 대상 단일 소스 = 대상 + 대장 + 비교(이 대상 연결분), 중복 제거 ──
  // 실거래 수집기·호가 수집기가 이 동일한 리스트를 공유한다(불일치 방지).
  const collectionTargets: ApartmentWithRole[] = useMemo(() => {
    const seen = new Set<string>();
    const out: ApartmentWithRole[] = [];
    const add = (apt: Apartment | undefined, role: "target" | "leader" | "comparable") => {
      if (apt && !seen.has(apt.id)) { seen.add(apt.id); out.push({ apartment: apt, role }); }
    };
    add(apartment, "target");
    if (!isSelfLeader) add(leaderApartment, "leader");
    selectedComparables.forEach((a) => add(a, "comparable"));
    return out;
  }, [apartment, leaderApartment, isSelfLeader, selectedComparables]);
  const collectionIds = new Set(collectionTargets.map((c) => c.apartment.id));
  const collectionTransactions = store.transactions.filter((t) => collectionIds.has(t.apartmentId));

  // ── 데이터 설정 3단계 위저드: 상세정보 → 비교단지·대장 → 데이터 수집 ──────────
  // 대상아파트 검색 → 상세정보 표출 → 비교단지 자동추천/대장설정 → 실거래·호가 수집 → 최종결과.
  // 이전엔 실거래 수집 버튼이 3곳(대장 개별/비교단지 일괄/통합)에 흩어져 있던 것을
  // 여기 1개 단계로 합치고, 나머지 단계는 명시적 "다음 단계" 버튼으로만 이동한다.
  const comparablesReady = selectedComparables.length > 0;
  const txReady = targetTransactions.length + comparableTransactions.length > 0;
  const listingsReady = targetListings.length > 0;
  const allReady = comparablesReady && txReady && listingsReady;
  const [dataStage, setDataStage] = useState<1 | 2 | 3>(() => {
    if (!comparablesReady) return 1;
    if (!txReady && !listingsReady) return 2;
    return 3;
  });
  const DATA_STAGES: { n: 1 | 2 | 3; label: string; done: boolean }[] = [
    { n: 1, label: "상세정보 확인", done: true },
    { n: 2, label: `비교단지·대장 설정 (${selectedComparables.length}개)`, done: comparablesReady },
    { n: 3, label: `실거래·호가 수집 (${targetTransactions.length + comparableTransactions.length + targetListings.length}건)`, done: txReady && listingsReady },
  ];

  if (!store.ready) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-md bg-slate-100" />
          <div className="h-4 w-32 animate-pulse rounded-md bg-slate-100" />
          <div className="card h-64 animate-pulse bg-slate-50" />
        </div>
      </AppShell>
    );
  }

  if (!apartment) {
    return (
      <AppShell>
        <div className="card p-6">
          <p className="font-semibold text-slate-700">대상아파트를 찾을 수 없습니다.</p>
          <a href="/targets" className="mt-3 inline-block text-sm text-blue-600 underline">대상아파트 목록으로 돌아가기</a>
        </div>
      </AppShell>
    );
  }

  async function runEstimate() {
    setEstimating(true);
    setJustDone(false);
    await new Promise((r) => setTimeout(r, 400)); // 진행 표시용 딜레이
    const weights = { ...defaultModelWeights, ...readStorage<Partial<ModelWeights>>(STORAGE_KEYS.modelSettings, defaultModelWeights) };
    const targetSaleListings = targetListings.filter((item) => item.listingType === "sale");
    const targetJeonseListings = targetListings.filter((item) => item.listingType === "jeonse");
    const comparableSaleListings = comparableListings.filter((item) => item.listingType === "sale");
    const presaleTxMedian = median(targetTransactions.filter((item) => item.transactionType === "presale").map((item) => item.price));
    const presalePrice = apartment?.originalPresalePrice ?? presaleTxMedian;

    // KB 매수우위지수 + 가격전망지수 → macroSignalPrice 계산
    // 우회 전략 3단계: ① 서버 Edge Route → ② 브라우저 직접 → ③ 0 폴백
    let macroSignalPrice = 0;
    try {
      let macroData: { buyerDominance: number; priceOutlook: number } | null = null;

      // 1단계: Vercel Edge Runtime 경유 (Lambda IP와 다른 엣지 IP)
      try {
        const r = await fetch("/api/kb-macro?weekly=true", { signal: AbortSignal.timeout(6000) });
        if (r.ok) {
          const j = await r.json();
          if (j.reasonCode === "ok" && j.data) macroData = j.data;
        }
      } catch { /* edge route 실패 → 2단계 */ }

      // 2단계: 브라우저 직접 fetch (Zigbang과 동일한 우회 패턴)
      if (!macroData) {
        const KB_DATA_API = "https://data-api.kbland.kr/bfmstat/weekMnthlyHuseTrnd/maktTrnd";
        const kbHeaders = {
          "Referer": "https://kbland.kr/",
          "Origin": "https://kbland.kr",
        };
        const [buyerRes, outlookRes] = await Promise.allSettled([
          fetch(`${KB_DATA_API}?메뉴코드=01&월간주간구분코드=02&기간=1`, { headers: kbHeaders, signal: AbortSignal.timeout(8000) }),
          fetch(`${KB_DATA_API}?메뉴코드=05&월간주간구분코드=01&기간=1`, { headers: kbHeaders, signal: AbortSignal.timeout(8000) }),
        ]);
        const getVal = async (r: PromiseSettledResult<Response>) => {
          if (r.status !== "fulfilled" || !r.value.ok) return 0;
          try {
            const j = await r.value.json();
            const rows = j?.dataBody?.data as Record<string, unknown>[] | undefined;
            return rows?.length ? Number(rows[0].지수값 ?? rows[0].indexValue ?? 0) : 0;
          } catch { return 0; }
        };
        const [bd, po] = await Promise.all([getVal(buyerRes), getVal(outlookRes)]);
        if (bd > 0 || po > 0) macroData = { buyerDominance: bd, priceOutlook: po };
      }

      // 지수 → 가격 보정
      if (macroData) {
        const { buyerDominance, priceOutlook } = macroData;
        const buyerSignal = buyerDominance > 0 ? (buyerDominance - 100) / 100 : 0;
        const outlookSignal = priceOutlook > 0 ? (priceOutlook - 100) / 100 : 0;
        const combined = (buyerSignal + outlookSignal) / 2;
        const anchor = targetSaleListings.length > 0
          ? median(targetSaleListings.map((l) => l.askingPrice))
          : (latestEstimate?.expectedSaleMid ?? 0);
        if (anchor > 0) {
          macroSignalPrice = Math.round(anchor * (1 + Math.min(0.05, Math.max(-0.05, combined * 0.1))));
        }
      }
    } catch { /* 모든 단계 실패 — macroSignalPrice=0 */ }

    const result = estimatePrice({
      targetApartmentId: id,
      targetSaleTransactions: targetTransactions.filter((item) => item.transactionType === "sale" || item.transactionType === "presale"),
      saleTransactions: comparableTransactions.filter((item) => item.transactionType === "sale" || item.transactionType === "presale"),
      // 전세 실거래 + 월세 실거래(환산전세가로 변환) — 월세만 있는 단지도 하방가 신호로 활용
      jeonseTransactions: [...comparableTransactions, ...targetTransactions]
        .filter((item) => item.transactionType === "jeonse" || item.transactionType === "monthly_rent")
        .map(convertMonthlyRentToJeonse),
      saleListings: targetSaleListings,
      comparableSaleListings,
      jeonseListings: [...targetJeonseListings, ...comparableListings.filter((item) => item.listingType === "jeonse")],
      targetArea: effectiveArea,
      locationPremiumRate,
      comparableLocationAdjustments: comparableGradeAnalysis.adjustments,
      comparableMarketPressureRate: comparableGradeAnalysis.marketPressureRate,
      weights,
      monthsOfInventory: inventorySignal?.monthsOfInventory ?? 0,
      turnoverAnnualized: inventorySignal?.turnoverAnnualized,
      comparableWeights,
      presalePrice,
      macroSignalPrice,
      leaderTransactions,
      targetToLeaderRatio: isSelfLeader ? 1.0 : rule?.targetToLeaderRatio,
      regionProfile: regionProfileFromAddress(apartment?.address),
      supplyCliffMode,
      supplyPressurePct: supplyVolume?.priceImpactPct,
    });
    store.setPriceEstimates([result, ...store.priceEstimates.filter((item) => item.targetApartmentId !== id)]);
    setEstimating(false);
    setJustDone(true);
    setTab("analysis");
    setTimeout(() => setJustDone(false), 5000);
  }

  function importTransactions(newTxs: import("@/types/transaction").Transaction[]) {
    if (newTxs.length > 0) store.setTransactions([...store.transactions, ...newTxs]);
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <nav className="flex items-center gap-1.5 text-sm text-slate-400">
            <Link href="/targets" className="font-semibold hover:text-blue-600">대상아파트</Link>
            <span>/</span>
            <span className="font-semibold text-slate-600">{apartment.name}</span>
          </nav>
          <h1 className="mt-1.5 text-3xl font-black">{apartment.name}</h1>
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

      {/* ── 데이터 설정 3단계 위저드 (설정 단계에서만 노출) ── */}
      {tab === "setup" && (
      <div className="mb-6 card p-4">
        <div className="flex items-center flex-wrap gap-y-3">
          {DATA_STAGES.map((stage, i) => (
            <div key={stage.n} className="flex items-center">
              {i > 0 && <div className="w-6 h-px bg-slate-200 flex-shrink-0 mx-1" />}
              <button
                type="button"
                onClick={() => setDataStage(stage.n)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all
                  ${dataStage === stage.n
                    ? "bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1 shadow-sm"
                    : stage.done
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
              >
                {stage.done ? "✓" : stage.n} {stage.label}
              </button>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ── 탭 ── */}
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {([
          ["setup", "데이터 설정"],
          ["analysis", "분석 결과"],
          ["model", "모델 상세"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-bold transition-colors ${
              tab === key
                ? "border-blue-500 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            {key === "model" && !latestEstimate && <span className="ml-1 text-xs text-slate-300">(추정 후)</span>}
          </button>
        ))}
      </div>

      {tab === "setup" && (
      <>
      {dataStage === 1 && (
        <div className="space-y-4">
          <AptDetailInfo apartment={apartment} />
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => setDataStage(2)}>
              다음 단계: 비교단지·대장 설정 →
            </button>
          </div>
        </div>
      )}

      {dataStage === 2 && (
        <div className="space-y-4">
          <ComparablesManager targetId={apartment.id} showCollectors={false} />
          {/* 대장은 비교단지 표와 다른 방식(가중치 아닌 비율)으로 관리되어 표에 안 보일 뿐,
              다음 단계에는 항상 함께 포함된다 — "왜 대장이 빠졌냐" 오해 방지용 명시 안내. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">다음 단계 수집 대상 — 총 {collectionTargets.length}개 단지:</span>{" "}
            {collectionTargets.map(({ apartment: a, role }) => `${{ target: "대상", leader: "대장", comparable: "비교" }[role]} ${a.shortName ?? a.name}`).join(" · ")}
            <span className="ml-2 text-emerald-600 font-semibold">모든 변경은 즉시 자동저장됩니다.</span>
          </div>
          <div className="flex justify-between">
            <button type="button" className="btn-secondary" onClick={() => setDataStage(1)}>← 이전</button>
            <button type="button" className="btn-primary" onClick={() => setDataStage(3)}>저장하고 다음 단계: 실거래·호가 수집 →</button>
          </div>
        </div>
      )}

      {dataStage === 3 && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <p className="font-bold text-slate-700">실거래 수집</p>
              <p className="mt-1 text-xs text-slate-500">
                대상·대장·비교단지 {collectionTargets.length}개 단지를 한 번에 수집합니다 (버튼 1개).
              </p>
            </div>
            <UnifiedTransactionFetcher
              apartments={collectionTargets}
              existingTransactions={collectionTransactions}
              onImport={importTransactions}
            />
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <p className="font-bold text-slate-700">호가·매물 수집 (직방 · KB)</p>
              <p className="mt-1 text-xs text-slate-500">동일한 {collectionTargets.length}개 단지의 현재 매물 호가를 수집합니다.</p>
            </div>
            <div className="p-4">
              <ListingFetcher apartments={collectionTargets} />
            </div>
          </div>

          <div className="flex justify-between">
            <button type="button" className="btn-secondary" onClick={() => setDataStage(2)}>← 이전</button>
            <button type="button" className="btn-primary" onClick={() => setTab("analysis")}>저장하고 최종결과 보기 →</button>
          </div>
        </div>
      )}
      </>
      )}

      {tab === "analysis" && (
      <>
      {/* ── 결과 요약 ── */}
      <div className="grid gap-5 lg:grid-cols-4">
        <div className={`rounded-xl border p-5 shadow-sm ${latestEstimate ? conclusionBg[latestEstimate.conclusion] : "bg-white border-slate-200"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">결론</p>
          {latestEstimate ? (
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ${conclusionBg[latestEstimate.conclusion]} ${conclusionColor[latestEstimate.conclusion]}`}>
              {conclusionLabel[latestEstimate.conclusion]}
            </span>
          ) : (
            <p className="mt-2 text-xl font-black text-slate-300">계산 필요</p>
          )}
          {latestEstimate && (
            <p className="mt-2 text-xs text-slate-500">{conclusionDesc[latestEstimate.conclusion]}</p>
          )}
        </div>
        <div className="rounded-xl border border-l-4 border-blue-400 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">예상 매매가</p>
          <p className="mt-1 text-4xl font-black tabular-nums text-blue-800">{latestEstimate ? formatEok(latestEstimate.expectedSaleMid) : "-"}</p>
          {latestEstimate && (
            <p className="mt-1 text-xs text-slate-400 tabular-nums">{formatEok(latestEstimate.expectedSaleMin)} ~ {formatEok(latestEstimate.expectedSaleMax)}</p>
          )}
        </div>
        <div className="rounded-xl border border-l-4 border-emerald-400 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">권장 매각호가</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-emerald-800">{latestEstimate ? formatEok(latestEstimate.recommendedAskingPrice) : "-"}</p>
          <p className="mt-1 text-xs text-slate-400">{moi > 0 && moi < 3 ? "예상가 +4~5% 상향 제시호가 (빠른 회전)" : "예상가 +3% 상향 제시호가"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">상승가능성 점수</p>
          <p className={`mt-1 text-2xl font-black tabular-nums ${latestEstimate ? upsideScoreColor(latestEstimate.upsideScore) : "text-slate-950"}`}>{latestEstimate ? `${latestEstimate.upsideScore}점` : "-"}</p>
          {latestEstimate && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, latestEstimate.upsideScore)}%`, backgroundColor: upsideScoreHex(latestEstimate.upsideScore) }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="card p-6 bg-gradient-to-br from-white to-blue-50/30">
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
              <div className="flex flex-col gap-1">
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${supplyCliffMode ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500"}`}
                >
                  <input type="checkbox" className="sr-only" checked={supplyCliffMode} onChange={(e) => setSupplyCliffMode(e.target.checked)} />
                  <span className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${supplyCliffMode ? "bg-orange-400" : "bg-slate-200"}`}>
                    <span className={`block h-3 w-3 rounded-full bg-white shadow transition-transform ${supplyCliffMode ? "translate-x-3" : "translate-x-0"}`} />
                  </span>
                  공급절벽 모드
                  {supplyCliffRecommended && !supplyCliffMode && (
                    <button type="button" onClick={(e) => { e.preventDefault(); setSupplyCliffMode(true); }} className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 hover:bg-orange-200">
                      공급절벽 감지 · 켜기
                    </button>
                  )}
                </label>
                <span className="text-[10px] leading-tight text-slate-400 max-w-[200px]">켜면 입지 비중↓, 전세 소진·호가 lock-in을 상방요인으로 가중</span>
              </div>
            <button
              className={`relative min-w-[140px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all ${!allReady ? "opacity-70" : ""}`}
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
            <div className="mt-4 rounded-xl border-l-4 border-emerald-400 bg-emerald-50 border border-emerald-200 p-4 flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-white text-sm font-black">✓</span>
              <div>
              <p className="font-bold text-emerald-800">가격 추정이 완료되었습니다.</p>
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
            </div>
          )}

          {!allReady && !justDone && (
            <p className="mt-3 text-xs text-amber-600">
              ⚠ {!comparablesReady ? "비교단지 선택" : !txReady ? "실거래 수집" : "호가 수집"}이 아직 완료되지 않았습니다. 데이터를 보완하면 더 정확한 추정이 가능합니다.
            </p>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Summary label="예상 하단" value={latestEstimate ? formatEok(latestEstimate.expectedSaleMin) : "-"} subtitle="예상가 -3%" />
            <Summary label="예상 상단" value={latestEstimate ? formatEok(latestEstimate.expectedSaleMax) : "-"} subtitle="예상가 +3%" />
            <Summary label="방어가격" value={latestEstimate ? formatEok(latestEstimate.defensePrice) : "-"} subtitle="이 밑으로는 손절 자제선" />
            <Summary label="예상 전세가" value={latestEstimate ? formatEok(latestEstimate.expectedJeonseMid) : "-"} subtitle="전세 실거래·호가 기반" />
            <Summary label="매물 회전속도(MOI)" value={moi > 0 ? `${moi}개월` : "-"} subtitle="활성매물 ÷ 월거래 — 낮을수록 매도자우위(빠른 소진)" title="MOI(재고소진월수) = 활성 매물수 ÷ 월 실거래속도. 낮을수록 매물이 빠르게 소진(매도자 우위·상승압력). 6개월=균형(NAR)." />
            <Summary
              label="신뢰도"
              value={latestEstimate ? `${latestEstimate.confidenceScore}점 (${latestEstimate.confidenceScore <= 30 ? "낮음" : latestEstimate.confidenceScore <= 60 ? "중간" : "높음"})` : "-"}
              subtitle="데이터 충분도 (0~100)"
              detail={latestEstimate ? `실거래 ${targetTransactions.length + comparableTransactions.length}건 · 비교호가 ${comparableListings.length}건 · 대장앵커 ${latestEstimate.leaderApartmentAnchorPrice > 0 ? "반영됨" : "미설정"}. 실거래·호가가 많고 대장이 설정될수록 높아집니다.` : undefined}
            />
            <Summary label="적용 평형" value={`${latestEstimate?.selectedArea ?? effectiveArea}㎡`} />
          </div>
        </div>
      </div>

      {latestEstimate && (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <h3 className="text-base font-black text-slate-800">실거래 · 호가 · 예상가 추이</h3>
            <p className="mb-3 mt-0.5 text-xs text-slate-500">실거래(진한 점) · 현재 호가(회색 점) · 예상가 밴드(파란 음영)와 권장호가·방어선을 한눈에.</p>
            <PriceTimeline estimate={latestEstimate} transactions={[...targetTransactions, ...comparableTransactions]} listings={[...targetListings, ...comparableListings]} />
          </div>
          <div className="card p-5">
            <h3 className="text-base font-black text-slate-800">상승가능성 · 신뢰도</h3>
            <p className="mb-3 mt-0.5 text-xs text-slate-500">점수대별 색과 신호별 적립 구성.</p>
            <UpsideGauge estimate={latestEstimate} />
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <DataCard title="선택 비교단지" value={`${selectedComparables.length}개`} description={selectedComparables.map((item) => item.shortName ?? item.name).join(", ") || "비교단지를 선택하세요."} accent="blue" />
        <DataCard title="실거래 입력" value={`${targetTransactions.length + comparableTransactions.length}건`} description="대상·비교단지 매매/분양권/전세 실거래를 선택 평형으로 환산합니다." accent="emerald" />
        <DataCard title="비교단지 호가" value={`${comparableListings.length}건`} description={matchingComparableListingCount ? `선택 평형 직접 매칭 ${matchingComparableListingCount}건` : "동일 평형이 없으면 ㎡당가로 환산합니다."} accent="violet" />
        <DataCard title="상·하급지 보정" value={`${Math.round(comparableGradeAnalysis.marketPressureRate * 100)}%`} description={comparableGradeAnalysis.summary} accent="amber" />
        <DataCard
          title="매물 회전속도(MOI)"
          value={moi > 0 ? `${moi}개월` : "-"}
          description={
            moi <= 0 ? "활성매물 ÷ 월거래로 산출. 실거래·매물 수집 후 표시됩니다."
            : moi < 3 ? "3개월 미만 — 빠른 소진(매도자 우위·상승압력)"
            : moi <= 6 ? "3~6개월 — 균형 시장"
            : "6개월 초과 — 적체(매수자 우위·하방압력)"
          }
          accent={moi > 0 && moi < 3 ? "red" : "slate"}
          fireSignal={moi > 0 && moi < 3}
        />
        <LocationFeaturesCard apartment={apartment} />
        <SupplyVolumeCard apartment={apartment} data={supplyVolume} loading={supplyLoading} onRefresh={fetchSupplyVolume} latestEstimate={latestEstimate} />
      </div>
      </>
      )}

      {tab === "model" && (
        latestEstimate && latestEstimate.modelBreakdown.length > 0 ? (
          <div className="card p-6">
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
            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <p className="mb-1 text-xs font-semibold text-slate-500">신호별 기여도 — 대상 실거래 앵커에서 각 신호가 예상가를 얼마나 올리고(파랑) 내렸는지(빨강)</p>
              <SignalWaterfall estimate={latestEstimate} />
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
        ) : (
          <div className="card p-10 text-center">
            <p className="text-base font-semibold text-slate-700">아직 추정 결과가 없습니다</p>
            <p className="mt-1 text-sm text-slate-400">분석 결과 탭에서 가격추정을 먼저 실행하세요.</p>
            <button type="button" onClick={() => setTab("analysis")} className="btn-primary mt-4 text-sm">분석 결과로 이동</button>
          </div>
        )
      )}

    </AppShell>
  );
}

function Summary({ label, value, title, subtitle, detail }: { label: string; value: string; title?: string; subtitle?: string; detail?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" title={!detail ? title : undefined}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {detail && (
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-blue-600 hover:underline">근거 {open ? "▲" : "▼"}</button>
        )}
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums text-slate-950">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
      {detail && open && <p className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-600">{detail}</p>}
    </div>
  );
}

const dataCardAccent: Record<string, string> = {
  blue: "border-l-4 border-blue-300",
  emerald: "border-l-4 border-emerald-400",
  violet: "border-l-4 border-violet-400",
  amber: "border-l-4 border-amber-400",
  red: "border-l-4 border-red-400",
  slate: "border-l-4 border-slate-200",
};

function DataCard({ title, value, description, accent = "slate", fireSignal }: { title: string; value: string; description: string; accent?: string; fireSignal?: boolean }) {
  return (
    <div className={`card p-5 ${dataCardAccent[accent] ?? ""}`}>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}{fireSignal && <span className="ml-1">🔥</span>}</p>
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
        <thead className="bg-blue-50 text-xs text-slate-500">
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
            <tr key={i} className={`border-t border-slate-100 ${f.active && (typeof f.result === "string" && parseFloat(f.result) > 0) ? "bg-emerald-50/40" : i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} ${!f.active ? "text-slate-400" : ""}`}>
              <td className="px-3 py-2 font-semibold text-slate-700">{f.label}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{f.source}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{f.rawValue}</td>
              <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">{f.weight}</td>
              <td className={`px-3 py-2 text-right font-bold tabular-nums ${f.active ? "text-slate-900" : "text-slate-400"}`}>{f.result}</td>
            </tr>
          ))}
          {totalLabel && (
            <tr className="border-t-2 border-blue-200 bg-blue-100">
              <td className="px-3 py-2 font-black text-blue-900" colSpan={4}>{totalLabel}</td>
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

      {/* 단지별 상세 목록 */}
      {data && data.monthlyData.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">
            단지별 상세 보기 ({data.monthlyData.reduce((s, m) => s + (m.complexes?.length ?? 0), 0)}개 단지)
          </summary>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-100">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold text-slate-500">입주월</th>
                  <th className="px-3 py-1.5 text-left font-semibold text-slate-500">단지명</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-slate-500">세대</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlyData.flatMap((m) =>
                  (m.complexes ?? []).map((c, i) => (
                    <tr key={`${m.yyyymm}-${i}`} className="border-t border-slate-50">
                      <td className="px-3 py-1 text-slate-400">{i === 0 ? fmtYm(m.yyyymm) : ""}</td>
                      <td className="px-3 py-1 font-medium text-slate-700">{c.name || "—"}</td>
                      <td className="px-3 py-1 text-right tabular-nums text-slate-600">{fmt(c.units)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function distanceBadge(m?: number) {
  if (m == null) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400">-</span>;
  const label = m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
  if (m <= 300) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{label}</span>;
  if (m <= 800) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{label}</span>;
  if (m <= 1500) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">{label}</span>;
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">{label}</span>;
}

function LocationFeaturesCard({ apartment }: { apartment: import("@/types/apartment").Apartment }) {
  const lf = apartment.locationFeatures;
  const hasCoords = apartment.latitude && apartment.longitude;
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-slate-500">입지 자동분석
        {lf?.fetchedAt && <span className="ml-2 text-xs font-normal text-slate-400">(OSM · {new Date(lf.fetchedAt).toLocaleDateString("ko-KR")})</span>}
        {!hasCoords && <span className="ml-2 text-xs font-normal text-amber-500">위경도 미설정</span>}
        {hasCoords && !lf && <span className="ml-2 text-xs font-normal text-slate-400">조회 중…</span>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <span className="text-slate-400">지하철역</span>
          <div className="flex items-center gap-1.5">{distanceBadge(lf?.nearestSubwayM)}{lf?.nearestSubwayName && <span className="text-slate-600">{lf.nearestSubwayName}</span>}</div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-slate-400">대형마트</span>
          <div className="flex items-center gap-1.5">{distanceBadge(lf?.nearestMartM)}{lf?.nearestMartName && <span className="text-slate-600">{lf.nearestMartName}</span>}</div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-slate-400">공원</span>
          <div className="flex items-center gap-1.5">{distanceBadge(lf?.nearestParkM)}{lf?.nearestParkName && <span className="text-slate-600">{lf.nearestParkName}</span>}</div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-slate-400">수변/산림</span>
          <span className="font-bold text-slate-700">{lf ? [lf.hasWaterfront && "수변", lf.hasForestPark && "산림"].filter(Boolean).join("·") || "없음" : "-"}</span>
        </div>
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
