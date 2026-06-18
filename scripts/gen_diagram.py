#!/usr/bin/env python3
# 가격추정 모델 로직 다이어그램 SVG 생성기
# flexbox 줄바꿈 문제를 피하려 좌표를 직접 계산해 정렬을 보장한다.
import html

W = 1480
MARGIN = 40
CW = W - 2 * MARGIN  # content width = 1400

parts = []
def add(s): parts.append(s)

def esc(s): return html.escape(str(s))

def rrect(x, y, w, h, r, fill, stroke=None, sw=1.5, dash=None):
    s = f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{fill}"'
    if stroke: s += f' stroke="{stroke}" stroke-width="{sw}"'
    if dash: s += f' stroke-dasharray="{dash}"'
    s += '/>'
    add(s)

def text(x, y, s, size=13, fill="#1e293b", weight="400", anchor="start", family=None):
    f = f' font-family="{family}"' if family else ''
    add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{f}>{esc(s)}</text>')

def lines(x, y, arr, size=11, fill="#475569", lh=15, anchor="start", weight="400"):
    for i, ln in enumerate(arr):
        text(x, y + i * lh, ln, size=size, fill=fill, anchor=anchor, weight=weight)

def box(x, y, w, h, title, sub, theme):
    fill, border, tcol = theme
    rrect(x, y, w, h, 8, "#ffffff", border, 1.5)
    rrect(x, y, 5, h, 8, fill)  # left accent bar
    text(x + 14, y + 20, title, size=13, fill=tcol, weight="700")
    lines(x + 14, y + 38, sub, size=10.5, fill="#475569", lh=14)

def arrow_down(cx, y1, y2, label=None):
    add(f'<line x1="{cx}" y1="{y1}" x2="{cx}" y2="{y2-10}" stroke="#94a3b8" stroke-width="2"/>')
    add(f'<path d="M{cx-6},{y2-10} L{cx+6},{y2-10} L{cx},{y2} Z" fill="#94a3b8"/>')
    if label:
        text(cx + 16, (y1 + y2) / 2 + 4, label, size=11, fill="#64748b", weight="600")

def section_header(y, title, color):
    rrect(MARGIN, y, CW, 26, 6, color)
    text(MARGIN + 14, y + 18, title, size=13, fill="#ffffff", weight="800")

# 테마: (accent, border, titlecolor)
TH_DATA   = ("#6366f1", "#c7d2fe", "#3730a3")
TH_PROC   = ("#0ea5e9", "#bae6fd", "#0369a1")
TH_ANCHOR = ("#059669", "#a7f3d0", "#065f46")
TH_SCORE  = ("#d97706", "#fcd34d", "#92400e")
TH_OUT    = ("#7c3aed", "#ddd6fe", "#5b21b6")
TH_SUPPLY = ("#64748b", "#cbd5e1", "#334155")

# ───────── 헤더 ─────────
add(f'<text x="{MARGIN}" y="40" font-size="24" font-weight="900" fill="#0f172a">대상단지 가격추정 모델 — 전체 로직</text>')
add(f'<text x="{MARGIN}" y="60" font-size="12" fill="#64748b">realtyprice · priceModel.ts 기준 · 데이터 → 전처리 → 가격앵커 → 상승점수 → 출력</text>')

y = 84

# ───────── 1. 데이터 수집 ─────────
section_header(y, "1. 데이터 수집  (국토부 실거래 · 호가 · 청약홈 · POI · 입주물량)", TH_DATA[0]); y += 34
n = 6; gap = 16; bw = (CW - (n-1)*gap) / n; bh = 78
data_boxes = [
    ("대상단지 실거래", ["매매 + 분양권전매", "속도가중 ×1.2"]),
    ("비교단지 실거래", ["선택 비교단지 매매", "comparableW ≤1.0"]),
    ("전세 실거래", ["보증금·계약일", "→ 전세가율 산출"]),
    ("매물 호가", ["대상·비교 매매호가", "전세 호가"]),
    ("대장아파트 실거래", ["인근 대장단지 매매", "속도가중 ×1.8"]),
    ("보조 입력", ["분양가(청약홈)", "거시·POI·입주물량"]),
]
for i,(t,s) in enumerate(data_boxes):
    box(MARGIN + i*(bw+gap), y, bw, bh, t, s, TH_DATA)
y += bh
arrow_down(W/2, y, y+34, "전처리·보정"); y += 34

# ───────── 2. 전처리 ─────────
section_header(y, "2. 전처리  (시간감쇠 · 면적환산 · 급지보정 · 지역레짐)", TH_PROC[0]); y += 34
n = 4; bw = (CW - (n-1)*gap) / n; bh = 86
proc_boxes = [
    ("시간감쇠 가중", ["서울 ≤1mo×1.5 ~ >12mo×0.55", "경기 ≤3mo×1.25 …", "공급절벽: 최근 ×1.15 추가"]),
    ("면적환산·등급보정", ["㎡당가 → 선택평형 환산", "areaFit ±3%→×1.25", "고층/향 등급보정"]),
    ("비교단지 급지보정", ["입지점수 차 → 조정률", "개별 ±12% 캡", "압력률 ÷2 (±5%)"]),
    ("지역 레짐 배수", ["서울: 비교압력×1.7 대장×1.6", "경기: 분양×1.4 소진×1.3", "가격앵커 가중치 재조정"]),
]
for i,(t,s) in enumerate(proc_boxes):
    box(MARGIN + i*(bw+gap), y, bw, bh, t, s, TH_PROC)
y += bh
arrow_down(W/2, y, y+34, "가중 산출"); y += 34

# ───────── 3. 가격 앵커 ─────────
section_header(y, "3. 가격 앵커 11항목  →  가중평균  →  예상가", TH_ANCHOR[0]); y += 34
anchors = [
    ("① 대상단지 실거래가", ["선택평형 가중평균", "[가중 높음]"]),
    ("② 비교단지 보정 실거래", ["급지조정 후 가중평균", "[가중 높음]"]),
    ("③ 비교단지 현재 호가", ["호가 중앙값·급지조정", "[중간]"]),
    ("④ 대상단지 현재 호가", ["매물 호가 중앙값", "[중간]"]),
    ("⑤ 전세기반 하방가", ["전세가 ÷ 전세가율", "[하방 방어선]"]),
    ("⑥ 매물소진 반영가", ["소진율 ≥30%→×1.04", "[보조]"]),
    ("⑦ 분양가 프리미엄", ["분양가×시세비율", "0.90~1.30 캡"]),
    ("⑧ 거시환경", ["수동 입력가", "없으면 제외"]),
    ("⑨ 대장아파트 앵커", ["대장가×ratio(0.88)", "γ=0.25~0.50"]),
    ("⑩ 대상 입지 보정", ["역·마트·공원 실거리", "최대 ±8%"]),
    ("⑪ 비교단지 급지압력", ["상급多+5%/하급-5%", "[중간]"]),
]
n = 4; bw = (CW - (n-1)*gap) / n; bh = 64
rows = [anchors[0:4], anchors[4:8], anchors[8:11]]
for r, row in enumerate(rows):
    ry = y + r*(bh+12)
    for i,(t,s) in enumerate(row):
        box(MARGIN + i*(bw+gap), ry, bw, bh, t, s, TH_ANCHOR)
y += 3*bh + 2*12 + 14

# 가중평균 수식 박스
fb_h = 56
rrect(MARGIN, y, CW, fb_h, 8, "#1e293b")
text(MARGIN+18, y+24, "가중평균 = Σ(값ᵢ × weightᵢ) / Σ(weightᵢ)", size=14, fill="#34d399", weight="700", family="monospace")
text(MARGIN+18, y+44, "(값>0 & weight>0 인 항목만 합산)   →   expectedSaleMid = round(가중평균)   ·   Min ×0.97 / Max ×1.03",
     size=11.5, fill="#cbd5e1", family="monospace")
y += fb_h
arrow_down(W/2, y, y+34, "상승가능성 점수"); y += 34

# ───────── 4. 상승가능성 점수 ─────────
section_header(y, "4. 상승가능성 점수 upsideScore  (기저 35 + 가산)", TH_SCORE[0]); y += 34
# base box + 4 component boxes
base_w = 150; gap2 = 14
rest_w = CW - base_w - gap2
n = 4; bw = (rest_w - (n-1)*gap2) / n; bh = 118
# base
bx = MARGIN
rrect(bx, y, base_w, bh, 8, "#ffffff", TH_SCORE[1], 1.5)
rrect(bx, y, 5, bh, 8, TH_SCORE[0])
text(bx+14, y+22, "기저값", size=13, fill=TH_SCORE[2], weight="700")
text(bx+base_w/2+2, y+62, "+35", size=30, fill="#92400e", weight="900", anchor="middle")
text(bx+base_w/2+2, y+86, "중립 출발점", size=10.5, fill="#475569", anchor="middle")
text(bx+base_w/2+2, y+102, "(데이터 존재 시)", size=10, fill="#94a3b8", anchor="middle")
score_boxes = [
    ("거래 속도  (최대 +25)", ["3-tier 일평균 속도 + 신고지연×2 보정",
        "accel14=r14/r90, accel30=r30/r90",
        "2주: ≥1.3→+15 ≥1.0→+10 ≥0.5→+4",
        "1개월: ≥1.2→+7 ≥0.9→+4",
        "3개월 ≥5건→+3  /  폴백 ≥3건→+5"]),
    ("전세 수요/공급  (-4~+7)", ["전세가율 = 전세 ÷ 매매 (중앙값)",
        "≥0.70 → +7  (수요 압력)",
        "≥0.60 → +3  (보통)",
        "≥0.50 →  0  (중립)",
        "<0.50 → -4  (공급 여력)"]),
    ("대장 앵커 상방  (0/+6)", ["대장 환산가 > 비교단지 시세",
        "→ +6  (상방 전이 기대)",
        "",
        "대장 미설정 → +0"]),
    ("비교단지 급지압력  (-3~+6)", ["pressureRate × 120 (상급, 최대+6)",
        "pressureRate × 60  (하급, 최소-3)",
        "",
        "서울 레짐 ×1.7 반영됨"]),
]
for i,(t,s) in enumerate(score_boxes):
    sx = MARGIN + base_w + gap2 + i*(bw+gap2)
    rrect(sx, y, bw, bh, 8, "#ffffff", TH_SCORE[1], 1.5)
    rrect(sx, y, 5, bh, 8, TH_SCORE[0])
    text(sx+14, y+20, t, size=12, fill=TH_SCORE[2], weight="700")
    lines(sx+14, y+40, s, size=10, fill="#475569", lh=14.5)
y += bh + 14
fb_h = 46
rrect(MARGIN, y, CW, fb_h, 8, "#1e293b")
text(MARGIN+18, y+19, "upsideScore = min(100, round( 35 + 거래속도 + 전세신호 + 대장상방 + 비교압력 ))",
     size=13, fill="#fbbf24", weight="700", family="monospace")
text(MARGIN+18, y+37, "hasMinData=false (대상실거래·비교실거래·호가 모두 부족) → upsideScore = 0",
     size=10.5, fill="#cbd5e1", family="monospace")
y += fb_h
arrow_down(W/2, y, y+34, "신뢰도·결론"); y += 34

# ───────── 5. 출력 ─────────
section_header(y, "5. 최종 출력", TH_OUT[0]); y += 34
n = 5; bw = (CW - (n-1)*gap) / n; bh = 80
out_boxes = [
    ("예상 매매가", ["Mid = 가중평균", "Min ×0.97 / Max ×1.03"]),
    ("예상 전세가", ["전세거래+호가 평균", "Min/Mid/Max"]),
    ("권장호가 / 방어가", ["권장 = Mid×1.03~1.05", "방어 = Mid×0.98"]),
    ("신뢰도 (0~100)", ["실거래수·최근거래", "호가·대장·전세 보너스"]),
    ("결론 6단계", ["≥75 강한상승 / ≥60 상승", "≥45 보합 / <30 조정필요"]),
]
for i,(t,s) in enumerate(out_boxes):
    box(MARGIN + i*(bw+gap), y, bw, bh, t, s, TH_OUT)
y += bh
arrow_down(W/2, y, y+34, "입주물량 2시점 보정"); y += 34

# ───────── 6. 입주물량 시뮬 ─────────
section_header(y, "6. 입주물량 2시점 시뮬레이션  (국토부 입주예정물량 API)", TH_SUPPLY[0]); y += 34
n = 2; bw = (CW - gap) / 2; bh = 92
rrect(MARGIN, y, bw, bh, 8, "#ffffff", TH_SUPPLY[1], 1.5)
rrect(MARGIN, y, 5, bh, 8, TH_SUPPLY[0])
text(MARGIN+14, y+20, "현재시점 (오늘 기준 3개월)", size=13, fill=TH_SUPPLY[2], weight="700")
lines(MARGIN+14, y+40, ["lawdCd 시군구 입주 세대수 합산",
    "≥3000→-5% ≥2000→-3% ≥1000→-1%",
    "≥500→0% ≥200→+2% <200→+3%"], size=10.5, lh=15)
sx = MARGIN + bw + gap
rrect(sx, y, bw, bh, 8, "#eff6ff", "#bfdbfe", 1.5)
rrect(sx, y, 5, bh, 8, "#3b82f6")
text(sx+14, y+20, "입주시점 (expectedMoveInYm ±1개월)", size=13, fill="#1e40af", weight="700")
lines(sx+14, y+40, ["같은 공급압력 공식 적용",
    "시뮬레이션가 = Mid × (1 + 입주시점% − 현재%)",
    "※ 다른 요소 고정, 공급 변화분만 반영"], size=10.5, lh=15)
y += bh + 24

# 푸터
text(MARGIN, y, "⚠ 가중치 배수·점수 구간은 리서치 기반 prior이며 실증 계수가 아님 (백테스트 보정 대상)",
     size=10.5, fill="#94a3b8")
y += 20

H = y + 20
svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="NanumGothic, NanumSquareRound, sans-serif">'
svg += f'<rect width="{W}" height="{H}" fill="#f8fafc"/>'
svg += "".join(parts) + "</svg>"

with open("price-model-diagram.svg", "w", encoding="utf-8") as f:
    f.write(svg)
print(f"OK width={W} height={H}")
