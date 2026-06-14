import Link from "next/link";
import { ArrowRight, Database, FileSpreadsheet, Gauge, ShieldCheck } from "lucide-react";

const features = [
  { label: "대상아파트", value: "검색/직접 추가/삭제", icon: Database },
  { label: "입력 우선", value: "수기 입력 + CSV 업로드", icon: FileSpreadsheet },
  { label: "판단 지표", value: "예상가/방어가/상승점수", icon: Gauge },
  { label: "저장 방식", value: "브라우저 localStorage", icon: ShieldCheck }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-lg font-black">realtyprice</p>
            <p className="text-xs font-semibold text-slate-500">frontend-only MVP</p>
          </div>
          <Link className="btn-primary inline-flex items-center gap-2" href="/dashboard">
            대시보드 열기 <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[1fr_420px] lg:items-center">
        <div>
          <h1 className="max-w-3xl text-4xl font-black leading-tight lg:text-5xl">분양권 매각 판단을 위한 업무용 가격 대시보드</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            비교단지 보정 실거래가, 현재 호가, 전세 하방가, 매물소진 신호를 한 화면에서 관리하고 예상 매매가와 권장 매각호가를 계산합니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn-primary inline-flex items-center gap-2" href="/targets">
              대상아파트 추가 <ArrowRight size={16} />
            </Link>
            <Link className="btn-secondary" href="/transactions">실거래 입력</Link>
            <Link className="btn-secondary" href="/listings">호가/매물 입력</Link>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-black">MVP 원칙</h2>
          <div className="mt-4 space-y-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.label} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="rounded-md bg-blue-50 p-2 text-blue-700">
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{feature.label}</p>
                    <p className="text-sm text-slate-500">{feature.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            백엔드와 지도 API 없이 동작하며, 네이버부동산/호갱노노는 외부 링크 버튼으로만 연결합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
