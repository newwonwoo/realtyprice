# realtyprice

분양권 매각 판단을 위한 프론트엔드 전용 MVP 대시보드입니다.

## 목표

사용자가 등록한 대상아파트의 매각 판단을 위해 비교단지 보정 실거래가, 현재 매매호가, 전세기반 하방가, 매물소진추정, 분양가 대비 프리미엄, 거시환경 가중치를 반영해 예상 매매가, 예상 전세가, 권장 매각호가, 방어가격, 상승가능성 점수를 산출합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 검증

```bash
npm run build
```

빌드가 성공하면 TypeScript 컴파일과 주요 Next.js 라우트 생성이 함께 확인됩니다.

## 주요 화면

- `/`: 랜딩페이지
- `/dashboard`: 대상아파트별 가격추정 현황
- `/targets`: 대상아파트 검색, 직접 추가, 삭제
- `/targets/[id]`: 대상아파트 상세, 가격추정 실행
- `/comparables`: 대상별 비교단지 기준, 선택/제외, 가중치 관리
- `/transactions`: 실거래 수기 입력 및 CSV 업로드
- `/listings`: 호가/매물 수기 입력 및 CSV 업로드, 매물소진추정 저장
- `/settings/api`: API 키 localStorage 저장
- `/settings/model`: 가격추정 모델 가중치 관리
- `/backup`: 전체 데이터 JSON 백업/복원

## CSV 형식

실거래 CSV 컬럼:

```csv
apartmentName,transactionType,price,exclusiveArea,contractDate,floor,buildingNo,unitNo,direction,grade
오산SK뷰2차,sale,52000,84,2026-06-01,12,101,1203,남향,B
```

호가/매물 CSV 컬럼:

```csv
apartmentName,listingType,askingPrice,exclusiveArea,capturedAt,listingKey,floor,buildingNo,unitNo,direction,grade
오산역 금강펜테리움센트럴파크,sale,61000,84,2026-06-13,osan-101-1203,12,101,1203,남향,B
```

`apartmentName` 대신 `apartmentId`를 사용할 수 있습니다. 등급은 `S`, `A`, `B`, `C`, `D`, `UNKNOWN` 중 하나입니다.

## 산식

예상 매매가 =

- 비교단지 보정 실거래가 40%
- 현재 매매호가 20%
- 전세기반 하방가 15%
- 매물소진속도 15%
- 분양가 대비 프리미엄 5%
- 거시환경 5%

동호수 등급은 모든 비교사례를 B급 기준 가격으로 환산합니다.

- S: `price / 1.05`
- A: `price / 1.02`
- B: `price`
- C: `price / 0.97`
- D: `price / 0.94`

매물소진추정은 `전일 매물수 + 신규매물수 - 금일 매물수`로 사라진 매물을 계산하고, `사라진 매물 / 전일 매물수`를 매물소진율로 봅니다. 전일 매물 중 하위 30% 가격대를 저가매물로 보며, 저가매물 소진율이 30% 이상이면 강한 상승 신호로 표시합니다.

## MVP 제약

- 백엔드 없음
- 지도 API, 카카오맵 API, 구글맵 API 미사용
- localStorage 기반 저장
- API 키도 localStorage 저장
- 네이버부동산/호갱노노는 외부 링크 버튼만 제공
- 관심아파트 별도 개념 없음
- 사용자가 추가하는 아파트는 모두 `role: "target"` 대상아파트
- JSON 백업에는 API 키를 포함하지 않음
