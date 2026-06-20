<!-- FABLIZE:BEGIN — run Opus like Fable (always-on router). Verified procedures only. Install/update: fablize setup.sh -->
## Operating mode (always on — auto-route by task signal)

Apply what the task signals; with no signal, baseline only. Read each pack only when needed. Routing: smallest matching discipline only, overlap only when genuinely multi-category, mimic observable behavior only.

- **[always]** Lead with the outcome · stay within the requested scope (no incidental refactors) · ground completion claims in this session's tool results · confirm before destructive or hard-to-reverse actions.
- **[2+ sequential stories]** Run `python3 __PLUGIN_ROOT__/scripts/goals.py`: create → next → checkpoint (with evidence) → final verification gate (no completion without `--verify-cmd` and `--verify-evidence`). Run from the repo root; state in `./.fablize/` (resume with `status`). Skip for single-step tasks.
- **[debugging / test failure / unknown cause / review]** Follow `__PLUGIN_ROOT__/packs/investigation-protocol.txt`: reproduce first → 3+ competing hypotheses → evidence per hypothesis → full causal chain → verify before/after → report rejected hypotheses.
- **[render/executable artifact: HTML, SVG, game, UI, chart]** Follow `__PLUGIN_ROOT__/packs/verification-grounding-pack.txt` grounding loop: run it in the real renderer → observe the output → fix what you see → re-run. A static check is not observation.
- **[hard or ambiguous task]** Adaptive thinking scales with difficulty automatically. To go higher, recommend `/effort xhigh` to the user. Depth (capability) cannot be raised: if stuck 2+ times or out-of-spec discovery is needed, report the limit honestly and escalate.
<!-- FABLIZE:END -->

---

## 프로젝트 개요: realtyprice

한국 수도권 아파트 **분양권·매매가 추정 SaaS**. 11개 가격신호 + 5개 상승신호를 지역별(서울/경기) 레짐으로 동적 가중 합산하는 헤도닉 가격 모델이 핵심.

**기술 스택**: Next.js 14.2 · Vercel Postgres · Tailwind CSS · Recharts  
**외부 API**: 한국부동산원(odcloud) · 국토부 실거래 · 네이버 부동산(비공식) · Overpass(OSM)  
**상태관리**: 커스텀 `useRealtyStore` — Vercel Postgres 우선, localStorage 폴백

---

## 라우트 구조

| 경로 | 설명 |
|------|------|
| `/` | 랜딩 |
| `/targets` | 대상아파트 목록·추가 |
| `/targets/[id]` | 가격추정 메인 페이지 |
| `/comparables` | 비교단지 관리 |
| `/listings` | 매물 목록 (네이버 수집) |
| `/transactions` | 실거래 내역 (국토부 수집) |
| `/dashboard` | 주요 신호 카드 |
| `/settings/api` | API 키 설정 |
| `/settings/model` | 모델 가중치 설정 |
| `/admin/verify-leaders` | 대장아파트 complexPk 검증 (관리자) |

---

## 핵심 파일

### `src/lib/priceModel.ts` — 가격추정 엔진
11개 컴포넌트 가중합산. 지역 프로파일(서울/경기)과 공급절벽 모드에 따라 가중치 동적 조정.

**11개 컴포넌트**: targetSalePrice(20%) · adjustedComparableSalePrice(25%) · comparableAskingPrice(10%) · saleAskingPrice(12%) · jeonseFloorPrice(10%) · inventorySignalPrice(8%) · presalePremiumPrice(5%) · macroSignalPrice(3%) · leaderApartmentAnchorPrice(5%) · locationPremiumPrice(2%) · comparableMarketPressurePrice(2%)

**상승점수(0~100)**: 기저 35 + 거래속도(최대25) + 전세가율 수요/공급 + 대장 상방압력 + 상/하급지 압력 + 입주물량 공급압력

### `src/lib/leaderApartments.ts` — 대장아파트 참조 테이블
서울 22개 + 경기·인천 26개 = 총 48개. `complexPk`(부동산원 14자리 단지고유번호)로 정확 매칭.

**판별 우선순위**:
1. `isLeaderByComplexPk(complexPk)` — 정확매칭 (우선)
2. `isLeaderApartment(name, address)` — 이름+주소 퍼지매칭 (폴백)
3. `findLeaderForAddress(address)` — region 키워드로 지역 대장 찾기

**수정 시 주의**: 단지명은 부동산원 공식명 기준. 환각 위험 높음 — 반드시 `data.go.kr/data/15106861`(한국부동산원 공동주택 단지 식별정보) CSV로 검증 후 수정.

### `src/lib/clientStore.ts` — 상태관리
`useRealtyStore()` 훅. 7개 엔티티(apartments, comparableRules, comparableApartments, transactions, listings, inventorySignals, priceEstimates) 관리. 변경 즉시 DB + localStorage 동시 저장.

### `src/lib/locationScore.ts` — 입지등급
지역·역세권·브랜드·세대수·연식 기반 입지 점수 산출. 비교단지 유사도 및 가격 보정에 사용.

---

## API 라우트

| 라우트 | 외부 API | 설명 |
|--------|---------|------|
| `/api/apt-search` | 한국부동산원 odcloud | 단지 조회 (complexPk 획득) |
| `/api/apt-presale` | 한국부동산원 | 분양가 정보 |
| `/api/apt-info` | 한국부동산원 | 단지 상세 (면적·세대수) |
| `/api/transactions` | 국토부 | 매매·전세·분양권 실거래 |
| `/api/naver-listings` | 네이버 비공식 | 현재 매물호가 수집 |
| `/api/location-score` | Overpass(OSM) | 지하철·마트·공원 거리 |
| `/api/supply-volume` | 국토부 | 입주예정물량 (3개월) |
| `/api/db/[entity]` | Vercel Postgres | 범용 CRUD |
| `/api/admin/verify-leaders` | 한국부동산원 odcloud | 대장아파트 complexPk 검색·매칭 |

---

## 대장아파트 관리 가이드

단지 수정이 필요할 때:

1. **complexPk 조회**: `data.go.kr` → "한국부동산원 공동주택 단지 식별정보" (데이터셋 15106861) CSV 다운로드 후 `COMPLEX_PK` 컬럼 확인
2. **관리자 페이지**: `/admin/verify-leaders` — API 키 입력 후 자동 검색·매칭 (API 키는 localStorage 저장)
3. **직접 수정**: `src/lib/leaderApartments.ts` — complexPk 없으면 이름+주소 퍼지매칭으로 폴백되나 오매칭 위험 있음

**주의**: 단지명을 임의로 추정해서 넣으면 안 됨. 환각 다수 발생 이력 있음. 반드시 실제 존재하는 단지명+complexPk 쌍으로 구성.

