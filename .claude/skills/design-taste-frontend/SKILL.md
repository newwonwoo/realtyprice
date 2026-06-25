---
name: design-taste-frontend
description: Anti-slop frontend design guidance. Read the brief first, then pull only the rules that fit. Set dials, choose system, implement contextually, run the Pre-Flight Check. Source: github.com/Leonxlnx/taste-skill
---

# Design Taste (Frontend)

> Every rule here is contextual. None fires automatically. Read the brief first, then pull only what fits.

## 0. Read the brief → design read → dials

Infer audience, aesthetic cues, brand assets, constraints before touching code.

Three dials (baseline 8/6/4, adjust to brief):
- DESIGN_VARIANCE (1-10): symmetry vs asymmetry. minimalist 5-6, playful 9-10.
- MOTION_INTENSITY (1-10): animation complexity. data tools low (2-4).
- VISUAL_DENSITY (1-10): spacing / info packing. dashboards higher (6-7).

## 1. Typography
- Sans-serif display by default. Serif strongly discouraged unless brand justifies.
- Avoid Inter as default. Prefer Geist, Outfit, Cabinet Grotesk, Satoshi. (Korean: Pretendard.)
- Banned serif defaults: Fraunces, Instrument_Serif.
- Body: `text-base text-gray-600 leading-relaxed max-w-[65ch]`.
- Never mix serif + sans in one headline for emphasis; use italic/bold of the same family.
- Em-dash ban (complete, non-negotiable): `—` forbidden everywhere. Use periods, commas, parentheses, colons, or line breaks. Hyphen only for ranges/compounds.

## 2. Color
- No AI-purple gradients by default.
- Premium-consumer palette ban: warm beige + brass + oxblood.
- Max one accent per page, saturation < 80%. Lock the accent across the whole page.
- No pure #000 / #fff. Off-black, off-white.

## 3. Layout hard rules
- Hero fits initial viewport: headline ≤ 2 lines, subtext ≤ 20 words/4 lines, CTAs visible without scroll. Hero top padding ≤ pt-24 desktop.
- Nav one line at desktop, height ≤ 80px, max 4 text elements.
- No 3-column equal feature cards. Use asymmetric grids, zig-zags, alternation.
- Eyebrow restraint: count ≤ ceil(sectionCount / 3).
- No 3+ consecutive left-image/right-text alternations.
- Bento grids: exact cell count (N items = N cells).
- No split-header (big headline left, small paragraph right) — stack vertically.
- ≥ 4 different layout families across 8 sections.

## 4. Anti-default discipline
Do not default to: AI-purple gradients, centered hero over dark mesh, three equal feature cards, generic glassmorphism, infinite micro-animations, Inter + slate-900.

## 5. Content & copy
- Max 25-word sub-paragraphs. Long lists (>5) → cards/tabs/accordions/carousels.
- No fake-precise numbers invented by the model. Use real data or plain language.
- Quotes ≤ 3 lines, clean attribution (no em-dash).

## 6. Motion
- Motion claimed = motion shown (if intensity > 4, page actually animates).
- Each animation motivated in one sentence.
- Max one marquee per page.
- Forbidden: `window.addEventListener('scroll')`, custom scroll-progress in React state, rAF loops touching React state. Use ScrollTrigger / Motion hooks / IntersectionObserver.
- Reduced motion mandatory for intensity > 3.
- Animate only transform + opacity.

## 7. Interactive states
- Full cycles: loading (skeletons, not spinners), empty, error, `:active` feedback.
- Button contrast WCAG AA (4.5:1 body, 3:1 large). CTA text one line. No duplicate CTA intent.
- No placeholder-as-label.

## 8. Images
Priority: image-gen tool → real web images (Picsum/stock/brand) → labeled placeholder slots.
- No div-based fake screenshots. Hand-rolled decorative SVGs discouraged.
- Real logos for trust walls (Simple Icons / devicon). No pills/labels over images.

## 9. Dark mode
- Mandatory for consumer pages; design both from start.
- One token strategy per project. Respect `prefers-color-scheme`. One theme per page.
- WCAG AA min in both modes. Off-black/off-white only.

## 10. Redesign mode
Detect: greenfield / preserve / overhaul. Audit brand, IA, patterns, a11y first.
Preserve URLs, nav labels, form field names, logo. Levers in priority order:
typography → spacing → color → motion → hero recomposition → full block replacement.
~70% of value at ~40% of risk via levers 1-4.

## AI tells forbidden by default
Section-number eyebrows (`00 / INDEX`), generic names (John Doe), fake-perfect numbers,
slop brand names (Acme/Nexus), filler verbs (Elevate/Seamless/Unleash), version labels in hero,
locale/time/weather strips, scroll cues, decorative status dots, "Quietly in use at", "Field notes",
generic step labels (Stage 1 / Phase 01).

## Pre-Flight Check (output fails if any box can't be honestly ticked)
Em-dash count zero · theme lock · contrast (button/form/overlay) · no button wrap · no duplicate CTA ·
hero fits + padding + stack · eyebrow count · zigzag cap · bento cells · long-list UI · real images ·
copy audit (no AI tells) · motion motivated + reduced-motion · nav one line · layout variety · dark mode tested.
