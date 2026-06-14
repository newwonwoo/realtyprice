import Link from "next/link";

const nav = [
  ["대시보드", "/dashboard"],
  ["대상아파트", "/targets"],
  ["비교단지", "/comparables"],
  ["실거래", "/transactions"],
  ["호가/매물", "/listings"],
  ["API 설정", "/settings/api"],
  ["모델", "/settings/model"],
  ["백업", "/backup"]
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-slate-200 bg-white p-5 lg:block">
        <Link href="/" className="text-lg font-black text-slate-950">realtyprice</Link>
        <nav className="mt-8 space-y-1">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <header className="border-b border-slate-200 bg-white lg:hidden">
        <div className="px-5 py-4">
          <Link href="/" className="text-lg font-black text-slate-950">realtyprice</Link>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {nav.map(([label, href]) => (
              <Link key={href} href={href} className="whitespace-nowrap rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-5 py-8">{children}</div>
      </main>
    </div>
  );
}
