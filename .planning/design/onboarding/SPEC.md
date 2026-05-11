# Design Spec — Onboarding

**Date**: 2026-05-11
**Target branch**: `design/onboarding`
**Owner**: design-architect (agent)
**Status**: ✅ approved (2026-05-11 — user approved as-is with all SPEC defaults: OQ-1=StepDots 3 dots, OQ-2=accept all microcopy changes, OQ-3=fallback link yes, OQ-4=Alert destructive for OAuth errors yes, OQ-5=logo 48px)

## 1. الهدف / Goal

رفع تجربة الإعداد الأولى لمستخدم جديد في GenCoder إلى مستوى تنافسي مع Cursor /
Windsurf / Cline upstream، بالتركيز على **إصلاح أربع ثغرات وصول لوحة المفاتيح**
التي تحجب المستخدم عن إكمال onboarding بدون فأرة، **توحيد لغة الاختيار البصرية**
بين بطاقات نوع المستخدم وبطاقات النموذج، **إظهار أخطاء التسجيل التي تُبتلع
صامتة اليوم**، و**إثراء شاشة OAuth** بمسار رجوع واضح.

We are explicitly NOT changing: provider list, proto messages, state keys,
provider OAuth backend, model fetch logic, or the BYOK provider drawer
(`ApiConfigurationSection`). All changes are visual / a11y / microcopy in
`webview-ui/src/components/onboarding/` plus one optional new file
(`StepDots.tsx`) and one optional shared primitive update.

## 2. الوضع الحالي / Current State (audit summary)

- 🔴 **A11y**: user-type and model cards are `<div onClick=…>` — not keyboard
  focusable, no `role="radio"`, no `aria-checked`. Keyboard users cannot
  complete onboarding. (`OnboardingView.tsx:62-108, 202-217`)
- 🔴 **Consistency**: two different "selected" treatments across consecutive
  steps — bg/border tokens differ between user-type cards and model cards.
  (`OnboardingView.tsx:64, 204`)
- 🔴 **Silent errors**: `accountLoginClicked({}).catch(() => {})` swallows
  every login failure. The user gets no feedback. (`OnboardingView.tsx:336, 342`)
- 🟠 **Step 2 ("Almost there")** is a passive spinner — no fallback link if the
  browser didn't open, no retry, no time-bound reassurance.
  (`OnboardingView.tsx:378-381`)
- 🟠 **Reduced-motion** ignored — `animate-pulse` and `animate-spin` always run
  even when the user requested less motion. (`OnboardingView.tsx:379, 403, 429`)
- 🟡 **Microcopy**: "Frontier Model" is jargon; "you can change this later"
  repeats on every step. (`data-steps.ts:52`, `OnboardingView.tsx:414`)
- 🟡 **Density**: 64px logo + title + description + 2 buttons + footer hint
  causes vertical overflow on small panels. (`OnboardingView.tsx:375`)

## 3. الإلهام / Inspiration (research summary)

- **P1 — Lightweight non-numeric progress** (Cursor / Windsurf): three small
  dots above the title beat enterprise "Step 2 of 3" chrome.
  https://hypereal.tech/a/cursor-setup-guide
- **P3 — "Where do I get this key?" link inline** with API-key inputs (Continue.dev).
  https://docs.continue.dev/customize/model-providers/top-level/openai
- **P5 — Richer OAuth handoff** with explicit "didn't open browser?" fallback
  (Copilot Chat pattern). https://code.visualstudio.com/docs/copilot/setup
- **P6 — Verbose, specific errors with doc link** rather than silent failures
  (Stytch / AX-friendly errors).
  https://stytch.com/blog/if-an-ai-agent-cant-figure-out-how-your-api-works-neither-can-your-users/
- **P8 — Keyboard-radio semantics** with `role="radio"` + `aria-checked` +
  arrow-key navigation (USWDS / WCAG 2.1.1).
  https://designsystem.digital.gov/components/step-indicator/accessibility-tests/

Patterns we deliberately reject: numbered step indicators, celebration modals,
"skip / explore later" link, provider brand-colored cards.

## 4. المبادئ التصميمية / Design Principles (for this area)

1. **Keyboard parity**: every action on every step is reachable via Tab + arrow
   keys + Enter. The cards become a true `radiogroup`.
2. **One selected-state language**: the same border/background combination
   means "selected" everywhere in onboarding. Cards stop competing for taste.
3. **Errors are surfaces, not exceptions**: the OAuth path renders an `Alert`
   when login fails, with a retry button.
4. **Implicit progress, not enterprise**: three dots indicate position; no
   "Step 2/3" chrome.
5. **Reduced-motion respected**: animations gated on `motion-safe:` Tailwind
   variant; reduced-motion users see static glyphs and a non-pulsing button.

## 5. التغييرات المقترحة / Proposed Changes

### Layout (per step)

```
┌───────────────────────────────┐
│   [logo 48px]                 │  <- shrunk from 64
│   ●  ○  ○                     │  <- new: StepDots (3 dots, current is filled)
│   Title                       │
│   Description (if any)        │
│                               │
│   ─────────────────────────── │
│   [card / form area]          │
│   ─────────────────────────── │
│                               │
│   [ Primary Button       ]    │
│   [ Secondary Button     ]    │
│   ⓘ You can change this later │  <- only on step 0
└───────────────────────────────┘
```

### Components (shadcn + custom)

**Reuse (existing in `webview-ui/src/components/ui/`)**:
- `Button` (replaces inline `rounded-xs` override; primitive already has it)
- `Item` + sub-parts (kept; selectable variant unified)
- `Input` (kept for model search)
- `Badge` (kept for model price/tag)
- `Label` (newly used to associate the search input)
- `Alert` (newly used for the footer hint AND for OAuth errors)
- `Separator` (replaces ad-hoc `border-t border-muted-foreground` divs)

**New** (one custom file):
- `webview-ui/src/components/onboarding/StepDots.tsx` — 30-line presentational
  component. Three radio-style dots. `aria-label="Step {n} of {total}"` on the
  group, `aria-current="step"` on the active dot. Pure CSS, no animation other
  than `transition-colors` (≤150ms). Justified because no shadcn primitive
  exists for this micro-pattern and importing a step-indicator library is
  overkill.

**Refactor in place** (no new files):
- `OnboardingView.tsx` — extract `UserTypeCard`, `ModelCard` (still inside the
  same file or as siblings) so both share an `aria-radio-card` shape. They both
  render `<div role="radio" tabIndex={…} aria-checked={…} onKeyDown={…}>` and
  use a unified selected-state class set.
- The user-type group and the model group each become a `<div role="radiogroup"
  aria-label="…">`. Arrow keys move selection within the group; Enter activates;
  Tab leaves the group entirely.

### Theme tokens

**No new tokens needed**. Existing tokens used:
- Selected card bg: `bg-input-background/80` (unified — matches today's model-card)
- Selected card border: `border-button-background`
- Idle card bg: `bg-transparent`
- Idle card border: `border-input-foreground/30`
- Hover: `hover:bg-input-background/40`
- Focus ring: relies on shadcn focus-visible defaults (`ring-1 ring-ring`)
- Muted text: replace `text-foreground/70` → `text-muted-foreground`

### States covered

- ✅ idle / hovered / focused / selected / disabled (cards)
- ✅ empty (no models returned → fall through to `WelcomeView`, unchanged)
- ✅ loading (step 2 OAuth wait; loader announced via `role="status"`)
- ✅ error (NEW — Alert appears at top of step content if `loginError` is set)
- ✅ keyboard nav: Tab between groups, ArrowUp/Down within a group, Enter to
  select, Enter on focused button to advance
- ✅ light & dark VS Code themes (auto via theme vars)
- ✅ high-contrast theme (we replace `text-foreground/70` with `text-muted-foreground`
  which is `var(--vscode-descriptionForeground)` — high-contrast safe)
- ✅ `prefers-reduced-motion`: `motion-safe:animate-pulse`, `motion-safe:animate-spin`,
  `motion-safe:transition-colors`. Reduced-motion fallback is the static glyph.

### Microcopy (en + ar)

This area is currently English-only; we preserve that, but provide Arabic
equivalents in this SPEC for traceability and for future localization.

| Key | Old (en) | New (en) | Note (ar) |
|---|---|---|---|
| Step 0 title | How will you use GenCoder? | (unchanged) | كيف ستستخدم GenCoder؟ |
| Step 0 description | Select an option below to get started. | Choose how you want to power your assistant. | اختر كيف ستزوّد المساعد بالطاقة. |
| User type 1 title | Absolutely Free | Free | مجاني |
| User type 1 desc | Get started at no cost | Hosted models with no upfront cost | نماذج مستضافة بدون تكلفة |
| User type 2 title | Frontier Model | Premium models | نماذج بريميوم |
| User type 2 desc | Claude, GPT Codex, Gemini, etc. | Claude, GPT, Gemini and other top-tier models | Claude وGPT وGemini ونماذج أخرى من الفئة الأولى |
| User type 3 title | Bring my own API key | Use my own API key | استخدم مفتاح API الخاص بي |
| User type 3 desc | Use GenCoder with your provider of choice | Connect to any supported provider | اربط بأي مزوّد مدعوم |
| Step 0 footer hint | You can change this later in settings | (unchanged, only shown on step 0 now) | يمكنك تغيير ذلك لاحقاً من الإعدادات |
| Step 2 title | Almost there! | (unchanged) | أوشكنا |
| Step 2 description | Complete account creation in your browser. Then come back here to finish up. | We opened your browser to finish sign-in. Come back here when you're done. | فتحنا المتصفح لإكمال تسجيل الدخول. ارجع هنا عند الانتهاء. |
| Step 2 fallback link | (none) | Browser didn't open? Try again. | لم يُفتح المتصفح؟ حاول مجدّداً. |
| OAuth error (NEW) | (silently swallowed) | Sign-in failed. Please try again. | فشل تسجيل الدخول. حاول مجدّداً. |
| OAuth error retry (NEW) | (none) | Retry | إعادة المحاولة |
| Search models placeholder | Search model... | Search other models... | ابحث عن نماذج أخرى... |
| Search models label (NEW, sr-only) | (missing) | Search for additional models | ابحث عن نماذج إضافية |
| No search results | No result found for "{q}" | No models found for "{q}". Try a different name. | لم يُعثر على نماذج لـ "{q}". جرّب اسماً آخر. |
| Step group "free" header | FREE | Free | مجاني |
| Step group "frontier" header | FRONTIER | Frontier | الفئة الأولى |
| Step group "open source" header | OPEN SOURCE | Open source | مفتوح المصدر |
| Step group "other options" | OTHER OPTIONS | More models | المزيد من النماذج |

Capitalization standardised to **sentence case** throughout (matches the welcome
cycle's choice).

## 6. CLI parity

**N/A** — `cli/` does not have an analog onboarding flow. CLI users go directly
through the settings panel (`SettingsPanelContent.tsx`) which has its own
auth flow per `.clinerules/cli.md`. No CLI follow-up needed for this cycle.

## 7. المخاطر / Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Adding `role="radio"` to model cards may conflict with existing handlers that count them as buttons in tests. | No tests exist for onboarding (`__tests__/` empty). Spot-check Storybook coverage in Phase 7. |
| Replacing `<Item onClick>` semantics may break the `onSelectModel("")` reset on search-input click. | Keep the `onClick` handler in addition to `onKeyDown`; both paths invoke the same callback. |
| `motion-safe:` variant requires Tailwind to have it enabled (it's a default). Verify in `tailwind.config.mjs`. | Verified — Tailwind ships `motion-safe:` in its default variants; no config change needed. |
| `Alert` primitive's `error` variant may not exist — need to check. | Audited: `alert.tsx` exists with `variants: default | destructive | warning` (we use `destructive` for OAuth error). Verified in implementer phase. |
| Surfacing OAuth errors requires a real error to surface from `accountLoginClicked`. The current `.catch(() => {})` discards it. | Wire the catch to set local `loginError` state. The backend behavior doesn't change — only the UI capable of displaying an error if one exists. If no error is thrown, no Alert renders. Zero regression risk. |
| Existing `STEP_CONFIG` imports `as const` and is consumed by typed reducers. Renaming microcopy strings is safe because they're string literals not enum keys. | Verified — only the `text` and `description` fields change; `action` keys (`signin`, `next`, etc.) stay. |

## 8. Verification

- New Storybook stories:
  - `StepDots.stories.tsx` — three states (1/3, 2/3, 3/3)
  - `OnboardingView.stories.tsx` — at minimum: step 0 (FREE preselected),
    step 1 (model picked), step 2 (loading), step 2 (error)
- `npm run check-types` ✅
- `npm run lint` ✅
- `npm run test:unit` ✅ — no snapshots to invalidate (none exist for onboarding)
- Manual: launch Extension Development Host (F5), reset welcome state, walk
  through onboarding in default + dark + high-contrast themes; complete the
  flow using **keyboard only**; trigger an OAuth error by going offline and
  pressing "Create my Account".

## 9. Out of scope

- BYOK provider list curation (today mounts the full `ApiConfigurationSection`).
  Defer to onboarding-v2 cycle that also refactors settings.
- API-key reveal toggle on the shared `Input` primitive. Touches a primitive
  used everywhere — separate cycle.
- Real backend error surfacing from `AccountServiceClient.accountLoginClicked`.
  This SPEC adds the *UI capability* to render an error; making the backend
  emit a useful one is a separate change.
- Logo replacement (we keep `ClineLogoWhite`; resizing only).
- Localization (Arabic UI strings); SPEC documents target translations for
  future i18n cycle.
- Welcome screen — pinned by the prior cycle on `design/welcome`.

## 10. أسئلة مفتوحة / Open Questions for User

- **OQ-1**: Three dots vs. no progress indicator? Cursor and Cline both omit
  any indicator. The dots add reassurance but also visual noise. *My recommendation: include them — first-run users benefit from orientation more than power-users are bothered by them.* Override?
- **OQ-2**: Sentence case microcopy ("Free" not "Absolutely Free", "Premium models" not "Frontier Model"). *Recommendation: yes — standardise.* Override?
- **OQ-3**: Add the "Browser didn't open? Try again." fallback link on step 2?
  *Recommendation: yes — table-stakes for OAuth flows.* Override?
- **OQ-4**: Surface OAuth errors via shadcn `Alert` (destructive variant) above
  the action buttons? *Recommendation: yes — silent failure is the worst UX.* Override?
- **OQ-5**: Logo size 48px (shrunk from 64px)? *Recommendation: 48px — matches Cline upstream and saves vertical room on small panels.* Override?
