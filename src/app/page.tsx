import Link from "next/link";
import { ArrowRight } from "lucide-react";

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

export default function LandingPage() {
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
