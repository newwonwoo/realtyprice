"use client";

import { AppShell } from "@/components/AppShell";
import { ApartmentSignalCard } from "@/components/dashboard/ApartmentSignalCard";
import { formatEok, formatPercent } from "@/lib/format";
import { median } from "@/lib/inventory";
import { useRealtyStore } from "@/lib/clientStore";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const store = useRealtyStore();
  const expectedSales = store.priceEstimates.map((estimate) => estimate.expectedSaleMid).filter(Boolean);
  const strongSignals = store.inventorySignals.filter((signal) => signal.lowPriceAbsorptionRate >= 0.3).length;
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    setHasApiKey(!!keys.find((k) => k.provider === "data_go_kr")?.value);
  }, []);

  const steps = buildSteps(store, hasApiKey);
  const completedSteps = steps.filter((s) => s.done).length;

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold text-blue-600">Dashboard</p>
        <h1 className="text-2xl font-black sm:text-3xl">가격추정 작업판</h1>
        <p className="mt-2 text-slate-600">다음에 무엇을 해야 하는지와 최근 추정 결과만 빠르게 확인합니다.</p>
      </div>

      {/* Progress Timeline */}
      <div className="mb-8 card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black">추정 준비 타임라인</h2>
          <span className="text-sm font-semibold text-slate-500">{completedSteps} / {steps.length} 완료</span>
        </div>
        <div className="relative">
          {/* progress bar */}
          <div className="mb-4 h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${(completedSteps / steps.length) * 100}%` }}
            />
          </div>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className={`flex items-start gap-3 rounded-lg p-2 ${step.done ? "bg-emerald-50" : "bg-slate-50"}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-black ${step.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                  {step.done ? "✓" : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${step.done ? "text-emerald-800" : "text-slate-700"}`}>{step.label}</p>
                  {step.detail && <p className="text-xs text-slate-500 mt-0.5">{step.detail}</p>}
                </div>
                {step.href && !step.done && (
                  <a href={step.href} className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700">이동 →</a>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Summary label="대상아파트" value={`${store.targets.length}개`} />
        <Summary label="가격추정 완료" value={`${store.priceEstimates.length}개`} />
        <Summary label="중앙 예상 매매가" value={formatEok(median(expectedSales))} />
        <Summary label="강한 저가소진 신호" value={`${strongSignals}개`} helper={formatPercent(0.3)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {store.targets.map((apartment) => (
          <ApartmentSignalCard key={apartment.id} apartment={apartment} estimate={store.priceEstimates.find((estimate) => estimate.targetApartmentId === apartment.id)} />
        ))}
        {!store.targets.length && <div className="card p-6 text-slate-600">대상아파트를 먼저 추가하세요.</div>}
      </div>
    </AppShell>
  );
}

type Step = { label: string; detail?: string; done: boolean; href?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSteps(store: any, hasApiKey: boolean): Step[] {
  const targetCount = store.targets.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comparableCount = store.comparableApartments.filter((c: any) => c.selected).length;
  const txCount = store.transactions.length;
  const listingCount = store.listings.length;
  const estimateCount = store.priceEstimates.length;

  return [
    {
      label: "① 공공데이터 API 키 등록",
      detail: hasApiKey ? "등록 완료" : "설정 > API 키 설정에서 data.go.kr 키를 등록하세요.",
      done: hasApiKey,
      href: "/settings/api",
    },
    {
      label: "② 대상아파트 추가",
      detail: targetCount ? `${targetCount}개 등록됨` : "매각 검토 중인 아파트를 추가하세요.",
      done: targetCount > 0,
      href: "/targets",
    },
    {
      label: "③ 비교단지 설정",
      detail: comparableCount ? `${comparableCount}개 선택됨` : "자동추천 또는 수동으로 비교단지를 선택하세요.",
      done: comparableCount > 0,
      href: "/comparables",
    },
    {
      label: "④ 실거래 데이터 수집",
      detail: txCount ? `${txCount}건 수집됨` : "대상아파트 페이지에서 국토부 실거래 데이터를 불러오세요.",
      done: txCount > 0,
      href: store.targets[0] ? `/targets/${store.targets[0].id}` : "/targets",
    },
    {
      label: "⑤ 호가/매물 수집",
      detail: listingCount ? `${listingCount}건 수집됨` : "네이버 부동산에서 현재 호가를 자동으로 불러오세요.",
      done: listingCount > 0,
      href: "/listings",
    },
    {
      label: "⑥ 가격 추정 실행",
      detail: estimateCount ? `${estimateCount}개 단지 추정 완료` : "대상아파트 페이지에서 가격 추정을 실행하세요.",
      done: estimateCount > 0,
      href: store.targets[0] ? `/targets/${store.targets[0].id}` : "/targets",
    },
  ];
}

function Summary({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      {helper && <p className="mt-1 text-xs text-slate-500">기준 {helper} 이상</p>}
    </div>
  );
}
