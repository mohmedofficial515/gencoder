# GenCoder Design Roadmap
> Maintained by `design-architect`. Last updated: **2026-05-11**.
> Bootstrapped via `/design` (roadmap mode).
> Status legend: ✅ done · 🟡 in-progress · ⬜ queued · ⏸ paused · ❌ rolled back

---

## How scoring works

Each area scored 1–5 on three axes; final score = `Visibility × Competitive Gap × Risk-Safety`.

- **Visibility** (V) — how often a user hits this surface per session. 5 = every interaction; 1 = power-user-only.
- **Competitive Gap** (G) — how far behind Cursor / Windsurf / Cline / Zed AI we likely are here. 5 = embarrassing gap; 1 = at parity or ahead.
- **Risk-Safety** (R) — how safe it is to redesign without breaking the codebase. **5 = low risk** (mostly visual, few tests pin it). **1 = high risk** (snapshot tests, proto types, ClineSay enum, provider-conversion layer, lots of state plumbing).

Higher score = better candidate to start with.

---

## Ranked matrix (full surface)

| # | Area | Path | V | G | R | Score | Status | Notes |
|---|---|---|---:|---:|---:|---:|---|---|
| 1 | **welcome** | `webview-ui/src/components/welcome/` | 3 | 4 | 5 | **60** | ✅ | **Complete 2026-05-11.** Manual Test Plan passed. Branch `design/welcome` pushed to origin (3 commits). PR target: `modular/research-mode`. See [`.planning/design/welcome/SUMMARY.md`](welcome/SUMMARY.md). |
| 1 | **onboarding** | `webview-ui/src/components/onboarding/` | 3 | 5 | 4 | **60** | ⏸ | Phases 1–7 complete on `design/onboarding` (commits `d6948ed67`, `8705c2510`, `4ce3e1fcf`, `698cc357e`). 5 atomic commits, +543/-66 across 6 files. Webview tsc / lint clean. Awaiting Manual Test Plan signoff. See `.planning/design/onboarding/MANUAL_TEST_PLAN.md`. |
| 3 | **menu** | `webview-ui/src/components/menu/` | 4 | 3 | 4 | **48** | ⬜ | Omnipresent navigation; small change → large UX payoff |
| 4 | **history** | `webview-ui/src/components/history/` | 3 | 3 | 4 | **36** | ⬜ | Mostly read-only display; Cursor's history is nicer |
| 5 | **settings** | `webview-ui/src/components/settings/` | 4 | 4 | 2 | **32** | ⬜ | High gap but high risk — provider conversion layer per CLAUDE.md |
| 6 | **cli** | `cli/src/components/` | 3 | 3 | 3 | **27** | ⬜ | Separate test surface; weight Aider in research |
| 7 | **common/ui** | `webview-ui/src/components/{common,ui}/` | 5 | 5 | 1 | **25** | ⬜ | Highest blast radius — touches everything; defer until later cycles |
| 8 | **chat** | `webview-ui/src/components/chat/` | 5 | 4 | 1 | **20** | ⬜ | Core surface but huge test surface, ClineSay enum, cancellation patterns |
| 9 | **account** | `webview-ui/src/components/account/` | 2 | 3 | 3 | **18** | ⬜ | Auth flows coupled to provider config |
| 10 | **mcp** | `webview-ui/src/components/mcp/` | 2 | 3 | 2 | **12** | ⬜ | Proto-heavy, complex server states |
| 10 | **browser** | `webview-ui/src/components/browser/` | 2 | 2 | 3 | **12** | ⬜ | Unique to Cline-family; fewer comparisons available |
| 12 | **cline-rules** | `webview-ui/src/components/cline-rules/` | 1 | 2 | 4 | **8** | ⬜ | Advanced power-user feature |
| 13 | **worktrees** | `webview-ui/src/components/worktrees/` | 1 | 2 | 3 | **6** | ⬜ | Niche; recent feature, low usage |

---

## Top 3 candidates — رشّحت هذه للبدء

### 🥇 #1 — **welcome** (score 60)
**ما هي**: شاشة الترحيب الأولى التي يراها المستخدم عند فتح GenCoder لأول مرّة، أو عند إعادة التشغيل بدون مهمّة جارية.
**لماذا هي مرشّح ممتاز للبدء**:
- **انطباع أوّل** يحدّد ثقة المستخدم في المنتج خلال أوّل 30 ثانية. هذه نقطة قوة استثمر فيها Cursor + Windsurf بكثافة (شاشات ترحيب مصقولة، CTAs واضحة، روابط للوثائق).
- **مخاطر منخفضة جداً** — مكوّنات شبه ثابتة، اختبارات قليلة تثبّتها، لا proto/state plumbing معقّد.
- **منعزلة** عن باقي التطبيق — لا تأثيرات جانبية على chat / settings / إلخ.
- **مكسب سريع** قابل لإكمال دورة كاملة (research → audit → SPEC → implement → verify) في يوم واحد.

### 🥈 #2 — **onboarding** (score 60)
**ما هي**: تدفّق الـ setup الأوّل (اختيار provider، إدخال API key، اختيار model). يلي شاشة welcome مباشرة.
**لماذا هي مرشّح ممتاز**:
- **أكبر فجوة بصريّة** مع المنافسين. Cursor's onboarding wizard معروف بالأناقة وHand-holding للمستخدمين الجدد. GenCoder ورث `OcaProvider`/`OcaModelPicker` وغيرها من Cline لكنّها dense وتقنية المظهر.
- **حسّاسية عالية للهجر**: إذا لم يكمل المستخدم الـ onboarding، لن يستخدم المنتج أبداً. كل تحسين هنا له ROI كبير.
- **مخاطر متوسطة-منخفضة** — البنية مرنة، لكن يجب الحذر من provider conversion layer (per `CLAUDE.md`).
- **بحث تنافسي غني** متاح: Cursor / Windsurf / Continue / Zed AI كلّها لها onboarding مرئي علناً.

### 🥉 #3 — **menu** (score 48)
**ما هي**: شريط التنقّل/الـ toolbar داخل الـ webview (`HistoryButton`, `SettingsButton`, `McpButton`, إلخ — توجد في `webview-ui/src/components/menu/`).
**لماذا هي مرشّح جيّد**:
- **حاضرة في كل لقطة** يراها المستخدم — تحسين صغير له تأثير دائم.
- **خفيفة structurally** — أزرار + tooltips + popovers، لا state معقّد.
- **مرنة للابتكار**: من هنا نُدخل أنماط من Cursor (command palette inline) أو من Zed AI (keyboard-first menu navigation).
- **تكامل مع shadcn primitives** المتاحة (button, hover-card, popover, tooltip).

---

## مناطق نُؤجّلها صراحةً للدورات اللاحقة

| Area | لماذا الآن مؤجّلة |
|---|---|
| **chat** | core surface لكن مخاطر التغيير عالية جداً (snapshot tests + ClineSay enum + cancellation patterns). نتركها لمرحلة لاحقة بعد بناء ثقة بالنظام. |
| **settings** | فجوة كبيرة لكن provider conversion layer (per CLAUDE.md) يجعل أي تغيير بنيوي خطر بدون SPEC مفصّل جداً. |
| **common/ui** | أعلى blast radius — تغيير primitive يؤثر على كل صفحة. نُجريه بعد الانتهاء من 2-3 دورات سطحيّة. |
| **mcp / browser / worktrees / cline-rules / account** | استخدام أقلّ تكراراً + complexity أعلى بدون payoff واضح لأوّل دورة. |

---

## CLI parity strategy

كل دورة على منطقة webview تسأل في §6 من SPEC: هل نعكس التغيير في `cli/src/components/`؟

- **welcome / onboarding**: غالباً لا — CLI له `AuthView.tsx` و`ConfigView.tsx` بمنطق مختلف. سيُقيَّم في الـ SPEC.
- **menu**: غير قابلة للنسخ مباشرة — CLI يستخدم keyboard shortcuts بدلاً من toolbar. لكن المبادئ تنتقل.
- **chat**: واجب نسخها — `cli/src/components/ChatMessage.tsx` و`ChatView.tsx` يجب أن تتبع نفس المبادئ.

سيكون هناك دورة منفصلة لاحقاً مخصّصة بالكامل لـ `cli` (ranked #6 في المصفوفة).

---

## تكامل مع `.gencoder/research/`

ملفّات competitive research الموجودة التي تدعم الدورات القادمة:

| Area المخطّطة | ملفّات `.gencoder/research/` ذات صلة |
|---|---|
| welcome / onboarding | (لا يوجد بعد — يستحقّ `/research ONBOARDING.md` قبل دورة `/design`) |
| menu | `SLASH_COMMANDS.md`, `WEBVIEW_UI.md` |
| settings | `API_PROVIDERS.md`, `STATE_MANAGEMENT.md` |
| chat | `WEBVIEW_UI.md`, `TOOL_EXECUTION.md` |
| mcp | `MCP_INTEGRATION.md` |
| browser | `BROWSER_BRIDGE.md` |
| cli | `CLI_ARCHITECTURE.md` |

**توصية**: قبل بدء دورة على `welcome` أو `onboarding`، شغّل `/research onboarding` (سينشئ ملف جديد) لمنح الـ design-researcher أرضيّة competitive جاهزة.

---

## Change Log

| Date | Change |
|---|---|
| 2026-05-11 | Initial roadmap bootstrap. 13 areas scored. Top 3: welcome, onboarding, menu. No cycles started yet. |
| 2026-05-11 | User selected **welcome** as first cycle. Marked 🟡 in-progress. |
| 2026-05-11 | `welcome` Phases 1–4 complete. Research at `.planning/design/research/welcome.md`, audit at `.planning/design/audits/welcome.md`, SPEC at `.planning/design/welcome/SPEC.md`. Discovered `WelcomeView.tsx` is unreachable except from onboarding — narrowed scope to `HomeHeader` + `SuggestedTasks` + `QuickWinCard`. Awaiting Phase 5 approval. |
| 2026-05-11 | `welcome` Phase 5 ✅ approved by user (Approve as-is, all SPEC defaults). Phase 6 (Implement) dispatched. |
| 2026-05-11 | `welcome` Phases 6–7 complete on branch `design/welcome` (2 commits, `6 files changed, +275/-61`). Webview tsc / lint clean; 3 pre-existing test failures confirmed unrelated. Storybook stories added for all 3 components. Status ⏸ — awaiting Manual Test Plan signoff before PR. |
| 2026-05-11 | `welcome` Manual Test Plan ✅ passed by user. Status → ✅ done. Branch pushed to `origin/design/welcome`. PR target: `modular/research-mode`. SUMMARY.md written. |
| 2026-05-11 | User selected **onboarding** as second cycle. Marked 🟡 in-progress. |
| 2026-05-11 | `onboarding` Phases 1–4 complete. Research at `.planning/design/research/onboarding.md`, audit at `.planning/design/audits/onboarding.md`, SPEC at `.planning/design/onboarding/SPEC.md`. Audit surfaced 4 RED a11y blockers (cards not keyboard-reachable) + silent OAuth errors + step-2 has no fallback. SPEC scoped to visual + a11y + microcopy only; no proto / state / provider changes. Awaiting Phase 5 approval. |
| 2026-05-11 | `onboarding` Phase 5 ✅ approved by user (Approve as-is, all SPEC defaults: StepDots yes, microcopy yes, fallback link yes, Alert variant yes, logo 48px). Phase 6 (Implement) dispatched. |
| 2026-05-11 | `onboarding` Phases 6–7 complete on branch `design/onboarding` (4 commits `d6948ed67`, `8705c2510`, `4ce3e1fcf`, `698cc357e`; `6 files changed, +543/-66`). Implemented in-loop by architect (no `design-implementer` sub-agent registered in this repo). Webview tsc / lint clean; same 10 pre-existing test failures as base commit confirmed unrelated. Storybook coverage: `StepDots` (3 states) + `OnboardingView` (4 states). SPEC said Alert `destructive` variant; primitive actually exposes `danger` — used `danger` (same visual treatment). Status ⏸ — awaiting Manual Test Plan signoff before PR. |
| 2026-05-11 | Merged `design/welcome` into `design/onboarding` for combined manual-test VSIX. ROADMAP conflict resolved manually (welcome ✅ done, onboarding ⏸ awaiting MTP). |
