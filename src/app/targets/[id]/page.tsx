"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ExternalLinks } from "@/components/targets/ExternalLinks";
import { TransactionFetcher } from "@/components/targets/TransactionFetcher";
import { AptDetailInfo } from "@/components/targets/AptDetailInfo";
import { formatEok, formatPercent } from "@/lib/format";
import { useRealtyStore } from "@/lib/clientStore";
import { defaultModelWeights } from "@/lib/seed";
import { estimatePrice } from "@/lib/priceModel";
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

  const apartment = store.targets.find((item) => item.id === id);
  const latestEstimate = store.priceEstimates.find((item) => item.targetApartmentId === id);
  const selectedLinks = store.comparableApartments.filter((item) => item.targetApartmentId === id && item.selected);
  const selectedComparableIds = selectedLinks.map((item) => item.apartmentId);
  const selectedComparables = store.apartments.filter((item) => selectedComparableIds.includes(item.id));
  const targetListings = store.listings.filter((item) => item.apartmentId === id);
  const targetTransactions = store.transactions.filter((item) => item.apartmentId === id);
  const comparableTransactions = store.transactions.filter((item) => selectedComparableIds.includes(item.apartmentId));
  const comparableWeights = Object.fromEntries(selectedLinks.map((item) => [item.apartmentId, item.compareWeight || 1]));
  const inventorySignal = store.inventorySignals.find((item) => item.apartmentId === id);
  const rule = store.comparableRules.find((item) => item.targetApartmentId === id);
  const leaderApartment = rule?.leaderApartmentId ? store.apartments.find((a) => a.id === rule.leaderApartmentId) : undefined;
  const leaderTransactions = rule?.leaderApartmentId
    ? store.transactions.filter((tx) => tx.apartmentId === rule.leaderApartmentId && (tx.transactionType === "sale" || tx.transactionType === "presale"))
    : [];

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
    const weights = readStorage<ModelWeights>(STORAGE_KEYS.modelSettings, defaultModelWeights);
    const targetSaleListings = targetListings.filter((item) => item.listingType === "sale");
    const targetJeonseListings = targetListings.filter((item) => item.listingType === "jeonse");
    const presalePrice = median(targetTransactions.filter((item) => item.transactionType === "presale").map((item) => item.price));
    const result = estimatePrice({
      targetApartmentId: id,
      saleTransactions: comparableTransactions.filter((item) => item.transactionType === "sale" || item.transactionType === "presale"),
      jeonseTransactions: [...comparableTransactions, ...targetTransactions].filter((item) => item.transactionType === "jeonse"),
      saleListings: targetSaleListings,
      jeonseListings: targetJeonseListings,
      weights,
      lowPriceAbsorptionRate: inventorySignal?.lowPriceAbsorptionRate ?? 0,
      comparableWeights,
      presalePrice,
      leaderTransactions,
      targetToLeaderRatio: rule?.targetToLeaderRatio,
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
              <p className="mt-1 text-sm text-slate-500">선택 비교단지 실거래와 대상아파트 호가/전세/매물소진 신호를 반영합니다.</p>
            </div>
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
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-black">산식 구성값</h2>
          <div className="mt-4 space-y-3">
            <Line label="비교단지 보정 실거래가 30%" value={formatEok(latestEstimate?.adjustedComparableSalePrice)} />
            <Line label="현재 매매호가 15%" value={formatEok(latestEstimate?.saleAskingPrice)} />
            <Line label="전세기반 하방가 15%" value={formatEok(latestEstimate?.jeonseFloorPrice)} />
            <Line label="매물소진속도 15%" value={formatEok(latestEstimate?.inventorySignalPrice)} />
            <Line
              label={`대장아파트 앵커 15%${leaderApartment ? ` (${leaderApartment.shortName ?? leaderApartment.name})` : " (미설정)"}`}
              value={formatEok(latestEstimate?.leaderApartmentAnchorPrice)}
              highlight={!!leaderApartment}
            />
            <Line label="분양가 대비 프리미엄 5%" value={formatEok(latestEstimate?.presalePremiumPrice)} />
            <Line label="거시환경 5%" value={formatEok(latestEstimate?.macroSignalPrice) || "미입력"} />
          </div>
          {leaderApartment && rule?.targetToLeaderRatio && (
            <p className="mt-3 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
              대장아파트 비율: {Math.round(rule.targetToLeaderRatio * 100)}%
              {leaderTransactions.length > 0 ? ` | 대장 실거래 ${leaderTransactions.length}건 반영` : " | 대장 실거래 데이터 없음"}
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
        <DataCard title="실거래 입력" value={`${targetTransactions.length + comparableTransactions.length}건`} description="대상아파트 전세/분양권과 비교단지 매매 실거래를 사용합니다." />
        <DataCard title="매물소진 신호" value={inventorySignal ? formatPercent(inventorySignal.lowPriceAbsorptionRate) : "-"} description={inventorySignal?.conclusion === "strong_up" ? "저가매물 소진율 30% 이상 강한 상승 신호" : "호가/매물 화면에서 산출합니다."} />
      </div>

      <div className="mt-6">
        <TransactionFetcher
          apartment={apartment}
          existingTransactions={[...targetTransactions, ...comparableTransactions]}
          onImport={importTransactions}
        />
      </div>
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
