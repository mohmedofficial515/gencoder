# Design Spec — Welcome / "No Active Task" Home
**Date**: 2026-05-11
**Target branch**: `design/welcome` (branched from `modular/research-mode` — note: NOT `main`, the current working branch is the research-mode modular refactor)
**Owner**: design-architect (agent)
**Status**: ✅ approved (2026-05-11 — user approved as-is with all SPEC defaults: OQ-1=size-14+my-3, OQ-2="Try one of these to start", OQ-3=shadcn Item rounded-md, OQ-4=demote Tour to ghost button)
**Research**: [`.planning/design/research/welcome.md`](../research/welcome.md)
**Audit**: [`.planning/design/audits/welcome.md`](../audits/welcome.md)

---

## 1. الهدف / Goal

نُعيد تصميم شاشة الـ "Home" التي يراها المستخدم عند فتح GenCoder بدون مهمّة جارية (post-onboarding) لكي تكون: **أقل ضوضاء بصريّة، متّسقة مع primitives الـ shadcn، قابلة للوصول بالكامل عبر لوحة المفاتيح، وآمنة على كل ثيمات VS Code (light / dark / high-contrast).**

**نُغيّر**: `webview-ui/src/components/welcome/HomeHeader.tsx`, `SuggestedTasks.tsx`, `QuickWinCard.tsx` + إضافة قصص Storybook + تحديثات نصيّة بسيطة على `WelcomeSection.tsx` (لا تغييرات منطقيّة).

**لا نُغيّر**:
- `welcome/WelcomeView.tsx` — خارج النطاق (يُستخدم فقط من `OnboardingView`؛ سيتمّ في دورة `onboarding`).
- منطق banner carousel أو history preview أو worktree badge في `WelcomeSection.tsx`.
- أي proto / state / proto-conversion plumbing.
- أي ميزة جديدة (نموذج/provider chip مُؤجَّل لـ SPEC لاحق إذا تطلّب state).

---

## 2. الوضع الحالي / Current State (audit summary)

من تقرير `.planning/design/audits/welcome.md`:

- 🔴 **High** — `QuickWinCard.tsx:33-46` — البطاقات `<div onClick>` بلا keyboard access ولا ARIA. ثلاث بطاقات غير قابلة للوصول بالكامل بلوحة المفاتيح.
- 🔴 **High** — `HomeHeader.tsx:38-44` — زرّ "Take a Tour" هو `<button>` خام بدلاً من shadcn `Button`. نفس النمط يتكرّر في `WelcomeSection.tsx:271-305`.
- 🟡 **Medium** — `bg-white/2` و`text-white` literals تكسر الـ light theme. (`HomeHeader.tsx:39`, `QuickWinCard.tsx:34`, `SuggestedTasks.tsx:16`)
- 🟡 **Medium** — أيقونات مختلطة بين codicon و lucide-react في نفس الشاشة.
- 🟡 **Medium** — `my-7 size-20` يستهلك ~76px قبل أوّل سطر نصّ على لوحة عرضها ~700px.
- 🟡 **Medium** — لا يوجد reduced-motion guard ولا loading state على بطاقات الـ quick wins.
- 🟡 **Medium** — Microcopy `"Quick [Wins] with GenCoder"` بنمط تسويقي غريب عن باقي التطبيق.

## 3. الإلهام / Inspiration (research summary)

من تقرير `.planning/design/research/welcome.md`:

- **P1 (Cursor / Windsurf)** — لا تُهيمن البراندنغ على أوّل-paint. اختصر الـ hero.
- **P3 (Cursor / Windsurf)** — المستخدم العائد يريد الـ recents لا التمبليتات. (نُحافظ على `HistoryPreview` كما هو.)
- **P6 (Windsurf explicitly)** — quiet > busy. قلّل العناصر المتنافسة على الـ viewport.
- **P7 (Cursor / Windsurf)** — زرّ "Tour" لا يجب أن يكون في الـ hero. demotion إلى affordance أصغر تحت الـ headline.
- **P9 (universal)** — لا microcopy تسويقي. "Try one of these" بدلاً من "Quick `[Wins]` with GenCoder".

**ملاحظة بحثيّة**: لا ندعو إلى نسخ Cursor's "Composer" أو Windsurf's "Cascade" — مبادئ فقط.

## 4. المبادئ التصميمية / Design Principles (this area)

- **PR-1** **Brand is small, work is big** — اللوغو يبقى (P8 من البحث) لكن بحجم `size-14` (56px) بدلاً من `size-20` (80px)، و`my-3` بدلاً من `my-7`.
- **PR-2** **Primitives over inline styles** — كل زرّ يمرّ عبر shadcn `Button`. كل بطاقة قابلة للنقر تمرّ عبر shadcn `Item`.
- **PR-3** **Keyboard parity with mouse** — كل affordance يمكن الوصول إليها بـ Tab + Enter. مرئيّاً focus-visible ring مرئي على كل ثيمات VS Code.
- **PR-4** **Theme-safe colors only** — لا `bg-white/*`، لا `text-white` literals. كل لون عبر `var(--vscode-*)` أو تكوينات Tailwind المُحدَّدة في `theme.css`.
- **PR-5** **Quiet motion** — كل animation تحترم `prefers-reduced-motion: reduce`.

## 5. التغييرات المقترحة / Proposed Changes

### Layout (post-change)

```
WelcomeSection (unchanged orchestrator)
└── HomeHeader (REDESIGNED — smaller, calmer)
    ├── <Logo> size-14 my-3      ← was size-20 my-7
    ├── <h1>What can I do for you?</h1>
    └── (optional) <TourButton>  ← shadcn Button variant=ghost size=sm
                                   ← moved below heading, demoted
└── BannerCarousel (unchanged)
└── HistoryPreview (unchanged) | SuggestedTasks (REDESIGNED)
└── (worktree badge — unchanged for this cycle)

SuggestedTasks (REDESIGNED)
└── <h2 className="text-description">Try one of these to start</h2>  ← plain copy
└── <ul role="list">
    └── QuickWinCard × 3       ← now keyboard-accessible

QuickWinCard (REDESIGNED)
└── shadcn <Item asChild><button>...</button></Item>
    ├── <Icon aria-hidden="true">  ← codicon kept (VS Code parity)
    ├── <ItemTitle>                ← shadcn slot
    └── <ItemDescription>          ← shadcn slot
```

### Components (shadcn + custom)

**Reuse (no new components)**:
- `webview-ui/src/components/ui/button.tsx` — for "Take a Tour"
- `webview-ui/src/components/ui/item.tsx` — for quick win cards (this is the shadcn-new-york primitive we already have)

**No new shadcn primitives needed.** The existing `Item` and `Button` cover every interactive surface in this redesign.

### Theme tokens

No new tokens are required.

- Replace `bg-white/2` with existing `bg-muted/40` (which is already `color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 65%, transparent) / 40%` — theme-safe).
- Replace `text-gray`+`text-white` literals in `SuggestedTasks.tsx` heading with the mapped `text-description` token and remove the bracket-emphasis pattern entirely (the new heading is one color).
- Replace arbitrary `text-(--vscode-...)` in `QuickWinCard.tsx` with mapped `text-foreground` / `text-description`.

### States covered
- ✅ idle — default state, three cards visible
- ✅ empty — no quick wins (defensive — already gated by `shouldShowQuickWins`)
- ✅ loading — clicking a quick win disables the card and shows a small spinner in its icon slot (we wrap `handleExecuteQuickWin` to set an `isPending` flag)
- ✅ error — toast/banner already handled upstream; we log via console as today
- ✅ disabled — quick wins are disabled while one is pending
- ✅ focus — `Item` ships `data-[state=]` and `focus-visible:ring-ring/50` via shadcn defaults
- ✅ hover — same as today, but via shadcn primitives
- ✅ keyboard — Tab cycles through Tour → QuickWin1 → QuickWin2 → QuickWin3; Enter/Space activates
- ✅ light & dark VS Code themes (auto via theme vars)
- ✅ high-contrast theme — no `text-white` literal anymore; relies on `--vscode-foreground` / `--vscode-descriptionForeground`
- ✅ `prefers-reduced-motion: reduce` — wrap transitions in `motion-safe:` Tailwind modifier OR add a media-query guard in `theme.css` on the keyframes

### Microcopy (en only this cycle; ar deferred)

| Where | Before | After |
|---|---|---|
| `SuggestedTasks` heading | `Quick [Wins] with GenCoder` (mixed-color) | `Try one of these to start` (single color, `text-description`) |
| `HomeHeader` Tour button | `Take a Tour ▶` (pill button, hero) | `Take a tour` (ghost button, smaller, below headline) |
| `quickWinTasks.ts` descriptions | (kept as-is — out of scope to retune all three; lower priority per audit) | (unchanged) |
| Headline | `What can I do for you?` | (unchanged — Cursor-style declarative is already correct) |
| Lazy-mode headline | `I guess I'm here to help` | (unchanged — intentional brand personality per audit Pillar 5) |

### Animations
- Keep `transition-colors duration-150 ease-in-out` on hover (already within budget).
- Wrap any fade in `motion-safe:` to honor reduced-motion.

## 6. CLI parity

**Verdict: defer for this cycle.**

The CLI (`cli/src/components/`) does not have a "no-task home" equivalent — the CLI flows directly from `AuthView` → `ChatView` after auth. There is no welcome surface that maps 1:1 to `HomeHeader`/`SuggestedTasks`.

However, the **principle of "quick win starter prompts"** could be ported to a slash-command suggestion drawer in the CLI's chat input. This is its own design idea worthy of a follow-up SPEC — added to `BACKLOG.md` (to be created if not present) as `cli-quick-prompts`.

## 7. المخاطر / Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Existing snapshot test in `__tests__/` may pin the current HomeHeader markup | Run `npm run test:unit` early in implement; if a snapshot diff is intentional, regenerate with `UPDATE_SNAPSHOTS=true` and review the diff carefully. Do NOT auto-update without review (per CLAUDE.md). |
| `Item` primitive may not support a `<button>` child cleanly (it's designed primarily for lists) | Verify by reading `webview-ui/src/components/ui/item.tsx` during implementation. If `Item` doesn't fit, fall back to a `<button>` styled with the same classes as `Item` provides (still shadcn-compliant). |
| The lazy teammate mode / December easter eggs depend on logo size; reducing `size-20` → `size-14` may make `ClineLogoSanta` look cramped | Visually inspect all three logo variants at `size-14` during implementation. If `ClineLogoSanta` requires more room for its hat, special-case to `size-16` (74px) for the Santa variant only. |
| Worktree badge layout in `WelcomeSection.tsx` was designed for the previous logo spacing | Since `WelcomeSection.tsx` itself is not edited in this SPEC (only its children), spacing should compose naturally. Verify manually in extension dev host. |
| The `QuickWinCard` rounded-full pill aesthetic may not survive the `Item` primitive (which uses `rounded-md`) | This is a **deliberate** visual change — pills with icons are unusual in VS Code chrome. The `Item` rounded-md aesthetic aligns with VS Code's native list rows. Call it out in the implementation so the user can object during verification. |

## 8. Verification

**Automated**:
- `npm run check-types` ✅ must pass
- `npm run lint` ✅ must pass
- `npm run test:unit` ✅ must pass — if a snapshot regenerates, manually review the diff and confirm in PR description
- Storybook stories added for `HomeHeader` (default + lazy mode + december + with-tour + without-tour) and `QuickWinCard` (default + pending + disabled). `SuggestedTasks` story already covered by composition.

**Manual** (in Extension Development Host, F5):
1. Light VS Code theme — every text element legible, focus ring visible on Tab
2. Dark VS Code theme — same checks
3. High-contrast theme — heading + descriptions both pass 7:1 contrast (informal eye-test, plus DevTools color picker)
4. `prefers-reduced-motion` system setting enabled — no fade/slide animations play
5. Keyboard-only flow: open extension → Tab through every affordance → Enter to activate each quick win → confirm `newTask` fires
6. Screen reader spot-check (NVDA on Windows): each quick win announces its title + description as a button

## 9. Out of scope

The following are explicitly NOT part of this cycle, to prevent scope creep:

- ❌ `WelcomeView.tsx` (onboarding territory)
- ❌ `WelcomeSection.tsx` orchestration logic — only its children's markup changes
- ❌ Banner carousel redesign — separate concern
- ❌ History preview redesign — separate concern (ranked #4)
- ❌ Worktree badge redesign — separate concern
- ❌ Adding a model/provider status chip (research P2) — requires state plumbing decisions; defer to a follow-up SPEC
- ❌ Adding a keyboard-hint footer (research P4) — overlaps with composer-owned hints in `ChatTextArea`; defer
- ❌ Bilingual (Arabic) microcopy support — needs i18n infrastructure decision first
- ❌ Replacing codicon with lucide on quick win icons — out of scope; mixing acknowledged as a Medium issue but lives across the codebase
- ❌ CLI parity — explicit defer to a `cli-quick-prompts` backlog item

## 10. أسئلة مفتوحة / Open Questions for User

These need an answer before Phase 6 (Implement). Default behaviors in **bold** will be used if no answer.

- **OQ-1** — Logo size reduction: do you accept `size-14` (56px, my-3) as the new default, or do you prefer to keep the current `size-20` (80px) and only reduce vertical margin? **Default: size-14 + my-3.**
- **OQ-2** — Headline `"Quick [Wins] with GenCoder"` → `"Try one of these to start"`: accept, or prefer a different replacement (e.g., `"Examples"`, `"Get started with"`, `"Suggested tasks"`)? **Default: "Try one of these to start".**
- **OQ-3** — QuickWinCard visual shape: keep the current **rounded-full pill** (visually distinctive but unusual in VS Code) or switch to **shadcn `Item`'s rounded-md** (aligned with VS Code's list rows)? **Default: rounded-md (via `Item`).**
- **OQ-4** — Tour button: demote to a small ghost link **below the headline**, or remove entirely from the home and rely on the help menu / command palette? **Default: demote, don't remove.**

---

## Appendix — Files this SPEC will touch (implementer reference)

| File | Change type |
|---|---|
| `webview-ui/src/components/welcome/HomeHeader.tsx` | Edit: size/margin tweaks; convert Tour button to shadcn `Button` |
| `webview-ui/src/components/welcome/SuggestedTasks.tsx` | Edit: heading copy + color; wrap in `<ul role="list">` |
| `webview-ui/src/components/welcome/QuickWinCard.tsx` | Edit: convert to shadcn `Item` + button semantics; add pending state; replace literal colors |
| `webview-ui/src/components/welcome/HomeHeader.stories.tsx` | **Create** |
| `webview-ui/src/components/welcome/QuickWinCard.stories.tsx` | **Create** |
| `webview-ui/src/components/welcome/SuggestedTasks.stories.tsx` | **Create** |

Estimated diff: ~250-350 lines across 3 edits + 3 new story files. Small SPEC by design.
