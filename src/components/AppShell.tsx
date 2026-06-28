"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, AlertTriangle } from "lucide-react";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";

const mainNav: [string, string][] = [
  ["① 대상아파트", "/targets"],
  ["② 비교단지", "/comparables"],
  ["③ 호가/매물", "/listings"],
  ["④ 대시보드", "/dashboard"],
];

const subNav: [string, string][] = [
  ["API 키 설정", "/settings/api"],
  ["모델 가중치", "/settings/model"],
  ["백업/복원", "/backup"],
  ["실거래 수동입력", "/transactions"],
  ["사용 매뉴얼", "/help"],
  ["시스템 진단", "/admin/diagnostics"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // 경로 변경 시 모바일 메뉴 자동 닫기
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // data.go.kr 키 유무 감지 — 없으면 자동수집 전부 비활성 → 전역 안내
  useEffect(() => {
    const keys = readStorage<{ provider: string; value: string }[]>(STORAGE_KEYS.apiKeys, []);
    const hasKey = keys.some((k) => k.provider === "data_go_kr" && (k.value ?? "").trim().length > 0);
    setKeyMissing(!hasKey);
    if (typeof window !== "undefined") {
      setBannerDismissed(window.sessionStorage.getItem("apikey_banner_dismissed") === "1");
    }
  }, [pathname]);

  function dismissBanner() {
    setBannerDismissed(true);
    if (typeof window !== "undefined") window.sessionStorage.setItem("apikey_banner_dismissed", "1");
  }

  const showKeyBanner = keyMissing && !bannerDismissed && pathname !== "/settings/api";

  function active(href: string) {
    if (pathname === href) return true;
    const hSegs = href.split("/").filter(Boolean);
    const pSegs = pathname.split("/").filter(Boolean);
    return hSegs.length > 0 && hSegs.every((seg, i) => pSegs[i] === seg);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 hidden h-full w-56 border-r border-slate-200 bg-white p-5 lg:block">
        <Link href="/" className="text-base font-black text-slate-950">realtyprice</Link>
        <nav className="mt-6 space-y-0.5">
          {mainNav.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={`block rounded-md px-3 py-2 text-sm font-bold transition-colors ${
                active(href)
                  ? "border-l-2 border-blue-500 bg-blue-50 pl-[10px] text-blue-700"
                  : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-slate-100 pt-4 space-y-0.5">
          {subNav.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={`block rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                active(href)
                  ? "border-l-2 border-slate-400 bg-slate-100 pl-[10px] text-slate-800"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="text-base font-black text-slate-950">realtyprice</Link>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileOpen}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {mobileOpen && (
          <nav className="border-t border-slate-100 px-4 pb-4 pt-2">
            <div className="space-y-0.5">
              {mainNav.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className={`block rounded-md px-3 py-2 text-sm font-bold transition-colors ${
                    active(href)
                      ? "border-l-2 border-blue-500 bg-blue-50 pl-[10px] text-blue-700"
                      : "text-slate-700 hover:bg-blue-50"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3 space-y-0.5">
              {subNav.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className={`block rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active(href) ? "border-l-2 border-slate-400 bg-slate-100 pl-[10px] text-slate-800" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="lg:pl-56">
        {showKeyBanner && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
            <p className="flex-1">
              <b>국토부·부동산원 API 키가 없어 자동수집이 비활성 상태입니다.</b> 실거래·호가·단지검색이 동작하지 않습니다.{" "}
              <Link href="/settings/api" className="font-bold text-amber-900 underline">API 키 설정으로 이동</Link>
              <span className="text-amber-600"> (data.go.kr 발급 후 등록, 승인까지 보통 1~2일)</span>
            </p>
            <button onClick={dismissBanner} aria-label="배너 닫기" className="flex-shrink-0 rounded p-0.5 text-amber-500 hover:bg-amber-100">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="px-5 py-8">{children}</div>
      </main>
    </div>
  );
}
