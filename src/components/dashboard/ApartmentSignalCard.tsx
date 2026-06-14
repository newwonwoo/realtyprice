import Link from "next/link";
import type { Apartment } from "@/types/apartment";
import type { PriceEstimate } from "@/types/model";
import { formatEok } from "@/lib/format";

const conclusionLabel: Record<PriceEstimate["conclusion"], string> = {
  strong_up: "강한 상승예상",
  up: "상승예상",
  neutral: "보합",
  weak: "약세주의",
  price_cut_needed: "매각가 조정 필요"
};

export function ApartmentSignalCard({ apartment, estimate }: { apartment: Apartment; estimate?: PriceEstimate }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">대상아파트</p>
          <h3 className="mt-1 text-xl font-black">{apartment.shortName ?? apartment.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{apartment.address}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
          {estimate ? conclusionLabel[estimate.conclusion] : "데이터 필요"}
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Metric label="예상 매매가" value={estimate ? `${formatEok(estimate.expectedSaleMin)} ~ ${formatEok(estimate.expectedSaleMax)}` : "-"} />
        <Metric label="권장 매각호가" value={estimate ? formatEok(estimate.recommendedAskingPrice) : "-"} />
        <Metric label="예상 전세가" value={estimate ? formatEok(estimate.expectedJeonseMid) : "-"} />
        <Metric label="상승가능성" value={estimate ? `${estimate.upsideScore}점` : "-"} />
      </div>
      <div className="mt-5 flex justify-end">
        <Link className="btn-secondary" href={`/targets/${apartment.id}`}>상세 보기</Link>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}
