from __future__ import annotations

HOME_PAGE = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RealtyPrice | 아파트 매매가 예측</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f7fb;
      --card: #ffffff;
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --text: #172033;
      --muted: #667085;
      --border: #d9e2ef;
      --success: #047857;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top left, #dbeafe 0, transparent 32rem), var(--bg);
      color: var(--text);
    }
    main {
      width: min(1100px, calc(100% - 32px));
      margin: 0 auto;
      padding: 48px 0;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
      gap: 28px;
      align-items: stretch;
    }
    .panel {
      background: rgba(255, 255, 255, .9);
      border: 1px solid var(--border);
      border-radius: 28px;
      box-shadow: 0 24px 70px rgba(32, 44, 84, .12);
      padding: 32px;
    }
    .eyebrow {
      color: var(--primary);
      font-weight: 700;
      margin: 0 0 12px;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    h1 {
      font-size: clamp(2.25rem, 5vw, 4.5rem);
      line-height: .95;
      margin: 0 0 20px;
      letter-spacing: -.05em;
    }
    .lead {
      color: var(--muted);
      font-size: 1.1rem;
      line-height: 1.7;
      margin: 0 0 28px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 28px;
    }
    .stat {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px;
    }
    .stat strong { display: block; font-size: 1.35rem; }
    .stat span { color: var(--muted); font-size: .9rem; }
    form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    label {
      display: grid;
      gap: 7px;
      color: #344054;
      font-weight: 650;
      font-size: .92rem;
    }
    label.full { grid-column: 1 / -1; }
    input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 13px 14px;
      font: inherit;
      color: var(--text);
      background: #fff;
      outline: none;
      transition: border-color .2s, box-shadow .2s;
    }
    input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 4px rgba(37, 99, 235, .12);
    }
    button {
      grid-column: 1 / -1;
      border: 0;
      border-radius: 16px;
      background: linear-gradient(135deg, var(--primary), var(--primary-dark));
      color: white;
      cursor: pointer;
      font-weight: 800;
      font-size: 1rem;
      padding: 15px 18px;
      box-shadow: 0 14px 30px rgba(37, 99, 235, .24);
    }
    button:disabled { opacity: .7; cursor: progress; }
    .result {
      grid-column: 1 / -1;
      min-height: 92px;
      border-radius: 18px;
      padding: 18px;
      border: 1px dashed var(--border);
      background: #f8fafc;
      color: var(--muted);
    }
    .result.success {
      border-color: rgba(4, 120, 87, .25);
      background: #ecfdf3;
      color: var(--success);
    }
    .result.error {
      border-color: rgba(180, 35, 24, .25);
      background: #fef3f2;
      color: var(--danger);
    }
    .price {
      display: block;
      color: var(--success);
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 900;
      letter-spacing: -.04em;
      margin-top: 6px;
    }
    @media (max-width: 820px) {
      .hero { grid-template-columns: 1fr; }
      form, .stats { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="panel">
        <p class="eyebrow">RealtyPrice Web App</p>
        <h1>아파트 매매가를 바로 예측하세요.</h1>
        <p class="lead">지역, 면적, 층수, 지하철 거리, 학군 점수를 입력하면 학습된 비교매물 모델이 예상 매매가를 계산합니다.</p>
        <div class="stats" aria-label="서비스 요약">
          <div class="stat"><strong>CSV</strong><span>학습 데이터</span></div>
          <div class="stat"><strong>JSON</strong><span>모델 저장</span></div>
          <div class="stat"><strong>API</strong><span>예측 연동</span></div>
        </div>
      </div>
      <div class="panel">
        <form id="prediction-form">
          <label class="full">지역
            <input name="district" value="Gangnam" required>
          </label>
          <label>건물 연식
            <input name="building_age" type="number" min="0" step="0.1" value="12" required>
          </label>
          <label>층수
            <input name="floor" type="number" step="1" value="14" required>
          </label>
          <label>전용면적(㎡)
            <input name="area_m2" type="number" min="1" step="0.1" value="84.5" required>
          </label>
          <label>지하철 거리(m)
            <input name="nearest_subway_m" type="number" min="0" step="1" value="320" required>
          </label>
          <label>학군 점수
            <input name="school_score" type="number" min="0" max="100" step="0.1" value="92" required>
          </label>
          <label>거래 연도
            <input name="transaction_year" type="number" min="1990" step="1" value="2026" required>
          </label>
          <button type="submit">예상 매매가 계산</button>
          <div id="result" class="result">모델을 학습한 뒤 예측 버튼을 눌러보세요.</div>
        </form>
      </div>
    </section>
  </main>
  <script>
    const form = document.querySelector('#prediction-form');
    const result = document.querySelector('#result');

    const numericFields = new Set([
      'building_age', 'floor', 'area_m2', 'nearest_subway_m', 'school_score', 'transaction_year'
    ]);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      const payload = Object.fromEntries(new FormData(form).entries());
      for (const field of numericFields) {
        payload[field] = Number(payload[field]);
      }

      button.disabled = true;
      result.className = 'result';
      result.textContent = '예측 중입니다...';

      try {
        const response = await fetch('/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || '예측에 실패했습니다.');
        }
        result.className = 'result success';
        result.innerHTML = `예상 매매가<span class="price">${data.estimated_price.toLocaleString()} ${data.currency_unit}</span>`;
      } catch (error) {
        result.className = 'result error';
        result.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>
"""
