"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ExternalLinks } from "@/components/targets/ExternalLinks";
import { formatEok } from "@/lib/format";
import { useRealtyStore } from "@/lib/clientStore";
import { defaultModelWeights } from "@/lib/seed";
import { estimatePrice } from "@/lib/priceModel";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import type { ModelWeights } from "@/types/model";

const conclusionLabel = {
  strong_up: "강한 상승예상",
  up: "상승예상",
  neutral: "보합",
  weak: "약세주의",
  price_cut_needed: "매각가 조정 필요"
} as const;

export default function TargetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const store = useRealtyStore();
  const apartment = store.apartments.find((x) => x.id === id);
  const latestEstimate = store.priceEstimates.find((x) => x.targetApartmentId === id);

  if (!apartment) {
    return <AppShell><div className="card p-6">대상아파트를 찾을 수 없습니다.</div></AppShell>;
  }

  function runEstimate() {
    const selectedComparableIds = store.comparableApartments.filter((x) => x.targetApartmentId === id && x.selected).map((x) => x.apartmentId);
    const txs = store.transactions.filter((x) => selectedComparableIds.includes(x.apartmentId));
    const listings = store.listings.filter((x) => selectedComparableIds.includes(x.apartmentId));
    const weights = readStorage<ModelWeights>(STORAGE_KEYS.modelSettings, defaultModelWeights);
    const result = estimatePrice({
      targetApartmentId: id,
      saleTransactions: txs.filter((x) => x.transactionType === "sale" || x.transactionType === "presale"),
      jeonseTransactions: txs.filter((x) => x.transactionType === "jeonse"),
      saleListings: listings.filter((x) => x.listingType === "sale"),
      jeonseListings: listings.filter((x) => x.listingType === "jeonse"),
      weights,
      lowPriceAbsorptionRate: 0.2
    });
    store.setPriceEstimates([result, ...store.priceEstimates.filter((x) => x.targetApartmentId !== id)]);
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

      <div className="grid gap-5 lg:grid-cols-4">
        <Summary label="결론" value={latestEstimate ? conclusionLabel[latestEstimate.conclusion] : "계산 필요"} />
        <Summary label="예상 매매가" value={latestEstimate ? formatEok(latestEstimate.expectedSaleMid) : "-"} />
        <Summary label="권장 매각호가" value={latestEstimate ? formatEok(latestEstimate.recommendedAskingPrice) : "-"} />
        <Summary label="상승가능성" value={latestEstimate ? `${latestEstimate.upsideScore}점` : "-"} />
      </div>

      <div className="card mt-6 p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-black">가격요약</h2>
            <p className="mt-1 text-sm text-slate-500">선택된 비교단지의 입력 데이터를 기준으로 계산합니다.</p>
          </div>
          <button className="btn-primary" onClick={runEstimate}>가격추정 실행</button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Summary label="예상 체결가 하단" value={latestEstimate ? formatEok(latestEstimate.expectedSaleMin) : "-"} />
          <Summary label="예상 체결가 상단" value={latestEstimate ? formatEok(latestEstimate.expectedSaleMax) : "-"} />
          <Summary label="방어가격" value={latestEstimate ? formatEok(latestEstimate.defensePrice) : "-"} />
          <Summary label="예상 전세가" value={latestEstimate ? formatEok(latestEstimate.expectedJeonseMid) : "-"} />
          <Summary label="신뢰도" value={latestEstimate ? `${latestEstimate.confidenceScore}점` : "-"} />
          <Summary label="계산일" value={latestEstimate?.estimateDate ?? "-"} />
        </div>
      </div>
    </AppShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}
