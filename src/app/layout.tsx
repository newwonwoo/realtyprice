import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "분양권 매각판단 대시보드",
  description: "실거래가, 호가, 전세가, 매물소진추정 기반 분양권 매각판단 MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
