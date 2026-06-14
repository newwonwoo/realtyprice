import Link from "next/link";
import { ArrowRight } from "lucide-react";

const patchTimeline = [
  { date: "2026.06", title: "평형 선택형 가격추정", detail: "대상단지와 비교단지 실거래·호가를 선택 전용면적 기준으로 환산합니다." },
  { date: "2026.06", title: "비교단지 호가 반영", detail: "비교단지에 동일 평형이 없어도 ㎡당 가격으로 보정해 추정에 사용합니다." },
  { date: "2026.06", title: "입지 보정 추가", detail: "초등학교·역세권·생활인프라 키워드를 가격 보정 요소로 분리했습니다." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-5 py-16 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-blue-300">realtyprice</p>
        <h1 className="mt-5 text-4xl font-black leading-tight sm:text-6xl">분양권 가격 추정으로 바로 이동</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
          복잡한 설명 대신 대상아파트 선택, 비교단지 설정, 가격추정 실행 흐름에 집중합니다.
        </p>
        <Link className="mt-10 inline-flex items-center gap-3 rounded-2xl bg-blue-500 px-8 py-4 text-lg font-black text-white shadow-2xl shadow-blue-950/40 hover:bg-blue-400" href="/targets">
          추정하러가기 <ArrowRight size={22} />
        </Link>

        <div className="mt-16 w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur">
          <h2 className="text-lg font-black">최근 패치 타임라인</h2>
          <ol className="mt-5 space-y-4">
            {patchTimeline.map((item) => (
              <li key={`${item.date}-${item.title}`} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4 sm:grid-cols-[90px_1fr]">
                <span className="text-sm font-black text-blue-300">{item.date}</span>
                <div>
                  <p className="font-black">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
