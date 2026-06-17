import { NextRequest, NextResponse } from "next/server";
import type { LocationFeatures } from "@/types/apartment";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function overpassQuery(query: string): Promise<OsmElement[]> {
  const res = await fetch(OVERPASS_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = await res.json();
  return (json?.elements ?? []) as OsmElement[];
}

function elemCoord(el: OsmElement): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  return null;
}

function nearest(elements: OsmElement[], lat: number, lng: number): { distM: number; name: string } | null {
  let best: { distM: number; name: string } | null = null;
  for (const el of elements) {
    const c = elemCoord(el);
    if (!c) continue;
    const d = haversineM(lat, lng, c.lat, c.lon);
    if (!best || d < best.distM) {
      best = { distM: Math.round(d), name: el.tags?.name ?? el.tags?.["name:ko"] ?? "" };
    }
  }
  return best;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");
  if (!latStr || !lngStr) return NextResponse.json({ error: "lat, lng 필요" }, { status: 400 });
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (isNaN(lat) || isNaN(lng)) return NextResponse.json({ error: "lat, lng 숫자여야 합니다" }, { status: 400 });

  try {
    // 하나의 Overpass 쿼리로 모든 요소 한꺼번에 조회 (round-trip 1회)
    const query = `
[out:json][timeout:15];
(
  node["railway"="station"]["station"="subway"](around:2000,${lat},${lng});
  node["railway"="station"]["subway"="yes"](around:2000,${lat},${lng});
  node["railway"="subway_entrance"](around:2000,${lat},${lng});
  node["shop"="supermarket"](around:2000,${lat},${lng});
  way["shop"="supermarket"](around:2000,${lat},${lng});
  way["leisure"="park"]["name"](around:2000,${lat},${lng});
  relation["leisure"="park"]["name"](around:2000,${lat},${lng});
  way["natural"="water"](around:500,${lat},${lng});
  way["waterway"="river"](around:500,${lat},${lng});
  way["waterway"="stream"](around:500,${lat},${lng});
  way["landuse"="forest"](around:1000,${lat},${lng});
  relation["landuse"="forest"](around:1000,${lat},${lng});
);
out center tags;
`;
    const elements = await overpassQuery(query);

    const subwayEls = elements.filter(
      (el) => el.tags?.["railway"] === "station" || el.tags?.["railway"] === "subway_entrance"
    );
    const martEls = elements.filter((el) => el.tags?.["shop"] === "supermarket");
    const parkEls = elements.filter((el) => el.tags?.["leisure"] === "park");
    const waterEls = elements.filter(
      (el) => el.tags?.["natural"] === "water" || el.tags?.["waterway"] === "river" || el.tags?.["waterway"] === "stream"
    );
    const forestEls = elements.filter((el) => el.tags?.["landuse"] === "forest");

    const subway = nearest(subwayEls, lat, lng);
    const mart = nearest(martEls, lat, lng);
    const park = nearest(parkEls, lat, lng);

    const features: LocationFeatures = {
      nearestSubwayM: subway?.distM,
      nearestSubwayName: subway?.name || undefined,
      nearestMartM: mart?.distM,
      nearestMartName: mart?.name || undefined,
      nearestParkM: park?.distM,
      nearestParkName: park?.name || undefined,
      hasWaterfront: waterEls.length > 0,
      hasForestPark: forestEls.length > 0,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(features);
  } catch (err) {
    return NextResponse.json({ error: `Overpass 조회 실패: ${String(err)}` }, { status: 500 });
  }
}
