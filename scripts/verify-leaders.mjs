#!/usr/bin/env node
// 하드코딩된 LEADER_APARTMENTS 테이블을 한국부동산원 API로 검증·교정한다.
// 각 항목을 단지명으로 조회 → 같은 시/구 결과 중 최적 매칭을 골라
// name·address·households·complexPk를 실제 API 값으로 덮어쓴다.
//
// 사용법:
//   DATA_GO_KR_KEY="발급키" node scripts/verify-leaders.mjs            # 미리보기(불일치 출력)
//   DATA_GO_KR_KEY="발급키" node scripts/verify-leaders.mjs --write    # 파일 직접 교정
//
// 키는 공공데이터포털 마이페이지의 일반 인증키(Decoding/Encoding 아무거나).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TABLE_PATH = join(__dirname, "../src/lib/leaderApartments.ts");
const API_BASE = "https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo";

const serviceKey = process.env.DATA_GO_KR_KEY;
const WRITE = process.argv.includes("--write");

if (!serviceKey) {
  console.error("❌ DATA_GO_KR_KEY 환경변수가 필요합니다.");
  console.error('   예: DATA_GO_KR_KEY="키" node scripts/verify-leaders.mjs');
  process.exit(1);
}

const noSpace = (s) => (s ?? "").replace(/\s/g, "");

function buildUrl(field, value) {
  let key = serviceKey;
  try { key = decodeURIComponent(serviceKey); } catch { /* keep */ }
  return `${API_BASE}?serviceKey=${encodeURIComponent(key)}&page=1&perPage=100`
    + `&cond[${field}::LIKE]=${encodeURIComponent(value)}&cond[COMPLEX_GB_CD::EQ]=1`;
}

async function searchByName(name) {
  const res = await fetch(buildUrl("COMPLEX_NM1", name), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.data ?? []).map((it) => ({
    complexPk: String(it["COMPLEX_PK"] ?? ""),
    name: String(it["COMPLEX_NM1"] ?? ""),
    address: String(it["ADRES"] ?? ""),
    households: Number(it["UNIT_CNT"] ?? 0),
  }));
}

// 같은 시/구 결과 중 이름 유사도(부분일치) + 세대수 근접으로 최적 후보 선정
function pickBest(entry, results) {
  const en = noSpace(entry.name);
  const inRegion = results.filter((r) => r.address.includes(entry.region));
  const pool = inRegion.length ? inRegion : results;
  const scored = pool.map((r) => {
    const rn = noSpace(r.name);
    let score = 0;
    if (rn === en) score += 100;
    else if (rn.includes(en) || en.includes(rn)) score += 60;
    if (entry.households && r.households) {
      const ratio = Math.min(entry.households, r.households) / Math.max(entry.households, r.households);
      score += ratio * 20;
    }
    if (r.address.includes(entry.region)) score += 10;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 50 ? scored[0].r : null;
}

function serializeEntry(e) {
  const parts = [
    `region: ${JSON.stringify(e.region)}`,
    `name: ${JSON.stringify(e.name)}`,
    `address: ${JSON.stringify(e.address)}`,
  ];
  if (e.brand) parts.push(`brand: ${JSON.stringify(e.brand)}`);
  if (e.households) parts.push(`households: ${e.households}`);
  if (e.complexPk) parts.push(`complexPk: ${JSON.stringify(e.complexPk)}`);
  return `  { ${parts.join(", ")} },`;
}

async function main() {
  const src = readFileSync(TABLE_PATH, "utf8");
  // 테이블의 객체 리터럴만 파싱 (region/name/address/brand/households/complexPk)
  const start = src.indexOf("export const LEADER_APARTMENTS");
  const arrStart = src.indexOf("[", start);
  const arrEnd = src.indexOf("];", arrStart);
  const body = src.slice(arrStart + 1, arrEnd);

  const entries = [];
  const re = /\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(body))) {
    const obj = {};
    for (const f of ["region", "name", "address", "brand", "complexPk"]) {
      const mm = m[1].match(new RegExp(`${f}:\\s*"([^"]*)"`));
      if (mm) obj[f] = mm[1];
    }
    const hm = m[1].match(/households:\s*(\d+)/);
    if (hm) obj.households = Number(hm[1]);
    if (obj.region && obj.name) entries.push(obj);
  }

  console.log(`📋 ${entries.length}개 대장단지 검증 시작…\n`);
  const corrected = [];
  let changed = 0, missing = 0;

  for (const entry of entries) {
    try {
      const results = await searchByName(entry.name);
      const best = pickBest(entry, results);
      if (!best) {
        missing++;
        console.log(`⚠️  매칭 실패: ${entry.region} ${entry.name} (결과 ${results.length}건)`);
        corrected.push(entry);
        continue;
      }
      const next = {
        ...entry,
        name: best.name || entry.name,
        address: best.address || entry.address,
        households: best.households || entry.households,
        complexPk: best.complexPk,
      };
      const diff = next.name !== entry.name || next.address !== entry.address || next.households !== entry.households;
      if (diff) {
        changed++;
        console.log(`🔧 ${entry.region}`);
        if (next.name !== entry.name) console.log(`     name: "${entry.name}" → "${next.name}"`);
        if (next.address !== entry.address) console.log(`     addr: "${entry.address}" → "${next.address}"`);
        if (next.households !== entry.households) console.log(`     세대: ${entry.households} → ${next.households}`);
        console.log(`     complexPk: ${next.complexPk}`);
      } else {
        console.log(`✅ ${entry.region} ${next.name} (pk ${next.complexPk})`);
      }
      corrected.push(next);
    } catch (e) {
      console.log(`❌ ${entry.region} ${entry.name}: ${e.message}`);
      corrected.push(entry);
    }
    await new Promise((r) => setTimeout(r, 120)); // 호출 간 간격
  }

  console.log(`\n요약: 교정 ${changed}건 · 매칭실패 ${missing}건 · 전체 ${entries.length}건`);

  if (WRITE) {
    const newBody = corrected.map(serializeEntry).join("\n");
    const next = src.slice(0, arrStart + 1) + "\n" + newBody + "\n" + src.slice(arrEnd);
    writeFileSync(TABLE_PATH, next, "utf8");
    console.log(`\n💾 ${TABLE_PATH} 교정 완료. (주석 라인은 제거됨 — git diff로 확인)`);
  } else {
    console.log(`\n미리보기 모드입니다. 실제 반영하려면 --write 플래그를 붙이세요.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
