import { ExternalLink } from "lucide-react";
import { getHogangnonoSearchUrl, getNaverLandSearchUrl } from "@/lib/externalLinks";

export function ExternalLinks({ apartmentName }: { apartmentName: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn-secondary inline-flex items-center gap-2" href={getNaverLandSearchUrl(apartmentName)} target="_blank" rel="noreferrer">
        네이버부동산 보기 <ExternalLink size={14} />
      </a>
      <a className="btn-secondary inline-flex items-center gap-2" href={getHogangnonoSearchUrl(apartmentName)} target="_blank" rel="noreferrer">
        호갱노노 보기 <ExternalLink size={14} />
      </a>
    </div>
  );
}
