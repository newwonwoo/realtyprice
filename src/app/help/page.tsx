"use client";
import { AppShell } from "@/components/AppShell";

const sections = [
  {
    title: "시작하기 — 사용 순서",
    items: [
      { step: "1", label: "API 키 설정", path: "/settings/api", desc: "공공데이터포털 키(국토부·부동산원)와 네이버 부동산 키를 입력합니다." },
      { step: "2", label: "대상 아파트 추가", path: "/targets", desc: "단지명으로 검색 후 선택. 분양권은 청약홈 탭에서 검색합니다." },
      { step: "3", label: "비교단지 설정", path: "/comparables", desc: "자동 추천 목록에서 유사 단지를 선택합니다. 거리·연식·세대수 기준으로 자동 매칭됩니다." },
      { step: "4", label: "데이터 수집", path: null, desc: "대상 단지 페이지에서 실거래(국토부)와 매물호가(네이버)를 수집합니다. 대장아파트 실거래도 별도 수집합니다." },
      { step: "5", label: "가격 추정 실행", path: null, desc: "수집 완료 후 '가격 추정' 버튼 클릭. 11개 신호 분해 테이블과 상승점수를 확인합니다." },
    ],
  },
];

const indicators = [
  { label: "추정가", desc: "11개 신호의 가중평균 최종 가격" },
  { label: "상승점수 (0~100)", desc: "기저 35점 + 거래속도·전세가율·대장압력·입주물량 합산. 60 이상이면 강세 신호." },
  { label: "신뢰도", desc: "데이터 충분도. 실거래 건수·호가 매물 수·대장 설정 여부로 결정됩니다." },
  { label: "👑 대장 배지", desc: "해당 구/시에서 가격을 선도하는 랜드마크 단지. 대장 실거래가 앵커 가격으로 사용됩니다." },
];

const pages = [
  { path: "/dashboard", desc: "모든 대상단지 추정가·상승점수 한눈에 비교" },
  { path: "/transactions", desc: "수집된 실거래 내역 조회·수동 입력" },
  { path: "/listings", desc: "현재 매물 호가 목록 및 소진율 추적" },
  { path: "/settings/model", desc: "11개 가중치 직접 조정 (서울/경기 프로파일)" },
  { path: "/admin/verify-leaders", desc: "대장단지 complexPk 검증 (관리자 전용)" },
];

export default function HelpPage() {
  return (
    <AppShell>
      <div className="max-w-2xl space-y-10">
        <div>
          <h1 className="text-2xl font-black text-slate-900">사용 매뉴얼</h1>
          <p className="mt-1 text-sm text-slate-500">분양권·매매가 추정 SaaS · realtyprice</p>
        </div>

        {/* 시작하기 */}
        <section>
          <h2 className="mb-4 text-base font-bold text-slate-800">시작하기 — 사용 순서</h2>
          <ol className="space-y-4">
            {sections[0].items.map(({ step, label, path, desc }) => (
              <li key={step} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">{step}</span>
                <div>
                  <p className="font-bold text-slate-800">
                    {path ? (
                      <a href={path} className="hover:text-blue-600 hover:underline">{label}</a>
                    ) : label}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 지표 해석 */}
        <section>
          <h2 className="mb-4 text-base font-bold text-slate-800">주요 지표 해석</h2>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {indicators.map(({ label, desc }) => (
              <div key={label} className="flex gap-4 px-4 py-3">
                <span className="w-40 shrink-0 text-sm font-bold text-slate-700">{label}</span>
                <span className="text-sm text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 페이지별 기능 */}
        <section>
          <h2 className="mb-4 text-base font-bold text-slate-800">페이지별 기능</h2>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {pages.map(({ path, desc }) => (
              <div key={path} className="flex gap-4 px-4 py-3">
                <a href={path} className="w-48 shrink-0 text-sm font-mono font-semibold text-blue-600 hover:underline">{path}</a>
                <span className="text-sm text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 가격모델 */}
        <section>
          <h2 className="mb-4 text-base font-bold text-slate-800">가격 모델 구성 (11개 신호)</h2>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
            {[
              ["대상 실거래가", "20%", "대상단지 직접 거래 (면적·시간 보정)"],
              ["비교단지 보정 실거래가", "25%", "유사단지 거래가 × 입지보정계수"],
              ["비교단지 호가", "10%", "현재 비교단지 매물 호가"],
              ["대상 호가", "12%", "현재 대상단지 매물 호가"],
              ["전세 하방가", "10%", "전세가율 기반 하방 지지선"],
              ["매물소진 신호", "8%", "저가매물 흡수율 반영"],
              ["분양가 프리미엄", "5%", "청약 분양가 대비 시세 프리미엄"],
              ["거시 신호", "3%", "사용자 입력 매크로 지표"],
              ["대장아파트 앵커", "5%", "대장 시세 × 대상/대장 비율"],
              ["입지 프리미엄", "2%", "역세권·학군·수변 보정"],
              ["비교단지 압력", "2%", "상/하급지 가격 압력"],
            ].map(([name, weight, desc]) => (
              <div key={name} className="flex gap-3 px-4 py-2.5">
                <span className="w-44 shrink-0 font-semibold text-slate-700">{name}</span>
                <span className="w-10 shrink-0 font-bold text-blue-600">{weight}</span>
                <span className="text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">* 서울/경기 레짐과 공급절벽 모드에 따라 가중치가 동적으로 조정됩니다.</p>
        </section>
      </div>
    </AppShell>
  );
}
