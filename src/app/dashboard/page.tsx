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

      <div className="mt-8 text-right text-xs text-slate-400">
        빌드 <code className="font-mono">{process.env.NEXT_PUBLIC_COMMIT_HASH ?? "dev"}</code>
        {" · "}{process.env.NEXT_PUBLIC_BUILD_TIME ? new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasPresalePrice = store.targets.some((t: any) => t.originalPresalePrice);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasCoords = store.targets.some((t: any) => t.latitude);

  return [
    {
      label: "① 공공데이터 API 키 등록",
      detail: hasApiKey ? "등록 완료 — 단지검색(부동산원), 분양가(청약홈), 실거래(국토부) 사용 가능" : "설정 > API 키 설정에서 data.go.kr 키를 등록하세요.",
      done: hasApiKey,
      href: "/settings/api",
    },
    {
      label: "② 대상아파트 추가",
      detail: targetCount
        ? `${targetCount}개 등록됨${hasPresalePrice ? " · 분양가 자동조회 완료" : ""}${hasCoords ? " · GPS 좌표 포함" : ""}`
        : "완공단지(부동산원) + 분양단지(청약홈) 동시 검색 — 추가 시 분양가·좌표 자동저장",
      done: targetCount > 0,
      href: "/targets",
    },
    {
      label: "③ 비교단지 설정",
      detail: comparableCount
        ? `${comparableCount}개 선택됨 — 입지·학군·위치등급 기준 정렬`
        : "자동추천: 행정구역 일치도·배정초등학교·신입생 수 기준 정렬. 수동 추가 가능.",
      done: comparableCount > 0,
      href: "/comparables",
    },
    {
      label: "④ 실거래 데이터 수집",
      detail: txCount
        ? `${txCount}건 수집됨 — 국토부 매매·전세·분양권전매`
        : "대상아파트 페이지에서 국토부 실거래 자동수집 (매매·전세·분양권전매)",
      done: txCount > 0,
      href: store.targets[0] ? `/targets/${store.targets[0].id}` : "/targets",
    },
    {
      label: "⑤ 호가/매물 수집",
      detail: listingCount
        ? `${listingCount}건 수집됨 — 매물소진율 산출 가능`
        : "네이버 부동산 호가 자동수집 · 저가매물 소진율(매물소진속도 신호) 산출",
      done: listingCount > 0,
      href: "/listings",
    },
    {
      label: "⑥ 가격 추정 실행",
      detail: estimateCount
        ? `${estimateCount}개 단지 추정 완료 — 면적보정·위치등급·대장앵커·지역레짐(서울/경기) 반영`
        : "선택 평형 면적보정, 비교단지 위치등급 압력, 대장 앵커, 주소기반 지역레짐(서울/경기) 가중치 전환",
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
