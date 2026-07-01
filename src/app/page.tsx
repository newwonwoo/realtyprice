"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useRealtyStore } from "@/lib/clientStore";
import { formatEok } from "@/lib/format";

const patchTimeline = [
  { date: "2026.06", title: "평형 선택형 가격추정", detail: "대상단지와 비교단지 실거래·호가를 선택 전용면적 기준으로 환산합니다." },
  { date: "2026.06", title: "비교단지 호가 반영", detail: "비교단지에 동일 평형이 없어도 ㎡당 가격으로 보정해 추정에 사용합니다." },
  { date: "2026.06", title: "입지 보정 추가", detail: "초등학교·역세권·생활인프라 키워드를 가격 보정 요소로 분리했습니다." },
];

const pillars = [
  { k: "실거래", v: "국토부 매매·전세·분양권 신고가" },
  { k: "호가", v: "직방·네이버 현재 매물 수집" },
  { k: "시장심리", v: "KB 매수우위·가격전망 지수" },
];

const conclusionLabel: Record<string, string> = {
  strong_up: "강한 상승예상",
  up: "상승예상",
  neutral: "보합",
  weak: "약세주의",
  price_cut_needed: "매각가 조정 필요",
  insufficient_data: "데이터 부족",
};
const conclusionBadge: Record<string, string> = {
  strong_up: "bg-emerald-500/15 text-emerald-300",
  up: "bg-blue-500/15 text-blue-300",
  neutral: "bg-slate-500/15 text-slate-300",
  weak: "bg-amber-500/15 text-amber-300",
  price_cut_needed: "bg-red-500/15 text-red-300",
  insufficient_data: "bg-slate-700 text-slate-400",
};

export default function LandingPage() {
  const store = useRealtyStore();

  // 로딩 중엔 마케팅 화면이 잠깐 번쩍였다 그리드로 바뀌는 걸 피하기 위해 빈 배경만 표시
  if (!store.ready) {
    return <main className="min-h-screen bg-slate-950" />;
  }

  // 저장된 대상아파트가 있으면 — 앱을 다시 열었을 때 결과 그리드를 바로 보여준다.
  if (store.targets.length > 0) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-sm font-bold text-blue-400">realtyprice</span>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">저장된 추정 결과</h1>
              <p className="mt-1 text-sm text-slate-400">대상아파트 {store.targets.length}개 · 클릭하면 상세로 이동합니다.</p>
            </div>
            <Link
              href="/targets"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-400"
            >
              + 새 대상아파트
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {store.targets.map((target) => {
              const estimate = store.priceEstimates.find((e) => e.targetApartmentId === target.id);
              return (
                <Link
                  key={target.id}
                  href={`/targets/${target.id}`}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-blue-500/60 hover:bg-slate-900/80"
                >
                  <p className="font-bold text-slate-100">{target.shortName ?? target.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{target.region}</p>
                  {estimate ? (
                    <div className="mt-4">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${conclusionBadge[estimate.conclusion]}`}>
                        {conclusionLabel[estimate.conclusion]}
                      </span>
                      <p className="mt-2 text-xl font-black text-white tabular-nums">{formatEok(estimate.expectedSaleMid)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{estimate.estimateDate} 추정 · 상승점수 {estimate.upsideScore}점</p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">아직 추정 전 — 데이터 설정을 진행하세요.</p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // 첫 방문(저장된 대상 없음) — 기존 마케팅 랜딩
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Hero — 좌측 정렬, 초기 화면에 맞춤 */}
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 pt-20 pb-16">
        <span className="text-sm font-bold text-blue-400">realtyprice</span>
        <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.15] tracking-tight sm:text-6xl">
          분양권 가격을 신호로 추정합니다
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
          대상아파트 선택, 비교단지 설정, 가격추정 실행. 세 단계 흐름에 집중합니다.
        </p>
        <div className="mt-9">
          <Link
            className="inline-flex items-center gap-2.5 rounded-xl bg-blue-500 px-7 py-3.5 text-base font-bold text-white transition-colors hover:bg-blue-400 active:bg-blue-600"
            href="/targets"
          >
            추정하러 가기 <ArrowRight size={20} />
          </Link>
        </div>

        {/* 데이터 소스 3축 — 동일 3칸 카드 회피 위해 라벨/값 인라인 행 */}
        <dl className="mt-16 grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-slate-800 bg-slate-800 sm:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.k} className="bg-slate-900 p-5">
              <dt className="text-sm font-bold text-blue-400">{p.k}</dt>
              <dd className="mt-1.5 text-sm leading-6 text-slate-400">{p.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 패치 타임라인 — 별도 밴드 */}
      <section className="border-t border-slate-900 bg-slate-950">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-black tracking-tight">최근 패치</h2>
          <ol className="mt-8 space-y-3">
            {patchTimeline.map((item) => (
              <li
                key={`${item.date}-${item.title}`}
                className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:grid-cols-[88px_1fr]"
              >
                <span className="text-sm font-bold text-slate-500">{item.date}</span>
                <div>
                  <p className="font-bold text-slate-100">{item.title}</p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
