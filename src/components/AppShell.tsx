import Link from "next/link";

// 작동 순서에 따른 동선
const mainNav = [
  ["① 대상아파트", "/targets"],
  ["② 비교단지", "/comparables"],
  ["③ 호가/매물", "/listings"],
  ["④ 대시보드", "/dashboard"],
];

const subNav = [
  ["API 키 설정", "/settings/api"],
  ["모델 가중치", "/settings/model"],
  ["백업/복원", "/backup"],
  ["실거래 수동입력", "/transactions"],
  ["사용 매뉴얼", "/help"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 hidden h-full w-56 border-r border-slate-200 bg-white p-5 lg:block">
        <Link href="/" className="text-base font-black text-slate-950">realtyprice</Link>
        <nav className="mt-6 space-y-0.5">
          {mainNav.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded-md px-3 py-2 text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700">
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-slate-100 pt-4 space-y-0.5">
          {subNav.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded-md px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600">
              {label}
            </Link>
          ))}
        </div>
      </aside>
      <header className="border-b border-slate-200 bg-white lg:hidden">
        <div className="px-4 py-3">
          <Link href="/" className="text-base font-black text-slate-950">realtyprice</Link>
          <nav className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {mainNav.map(([label, href]) => (
              <Link key={href} href={href} className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
                {label}
              </Link>
            ))}
            {subNav.map(([label, href]) => (
              <Link key={href} href={href} className="whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-400">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="lg:pl-56">
        <div className="px-5 py-8">{children}</div>
      </main>
    </div>
  );
}
