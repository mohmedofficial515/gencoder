# GenCoder Modular Extraction Roadmap

**Bootstrapped**: 2026-05-11
**Owner agent**: `modular-architect`
**Current dev branch**: `gencoder-main`
**Per-module branch convention**: `modular/<module-name>`

> هذا الملف هو خارطة الطريق الرسمية لتقسيم GenCoder إلى وحدات مستقلة (open-source friendly). يُحدَّث في بداية كل دورة (الوحدة الحالية ← 🟡) وفي نهايتها (✅ أو ❌). لا يتم تنفيذ أي استخراج من هنا — كل وحدة تمر عبر دورة Plan → Approval → Extract → Verify → Push → Manual Test → Summary.

---

## Status legend / مفتاح الحالات

| Symbol | Meaning |
|---|---|
| ✅ | Done — extracted, verified, manual-tested, signed off |
| 🟡 | In-progress (current cycle) |
| ⬜ | Queued |
| 🚫 | Blocked (waiting on something — see notes) |
| 🔒 | Deferred / not a candidate for extraction (see "Modules deferred" below) |

---

## Scoring rubric / معايير الترتيب

Each module is scored on three axes, **1 = worst, 5 = best**. Total score = sum (max 15). Higher = extract sooner.

| Axis | What it measures | High (5) example | Low (1) example |
|---|---|---|---|
| **Independence** | How few inbound dependencies and how concentrated the source files are. Already-in-its-own-folder + ≤5 external consumers ⇒ 5. | `services/research/` (4 files, 3 consumers) | Anything that bleeds across `src/core/task/`, `webview-ui/`, `cli/` |
| **Fork-distinctive value** | How much it differentiates GenCoder from Cline/Cursor/Continue. Fork-original code scores high; generic plumbing scores low. | DeepSeek bridge + PoW solver (no upstream equivalent) | Generic build scripts |
| **Inverse risk** | 5 = low risk extraction. Things that touch proto wire format, native tool calling, state-key plumbing, or system-prompt snapshots are **high risk** per `CLAUDE.md`. | Self-contained service with one entry point | Cross-cuts `proto/`, `state-helpers.ts`, prompt variants |

**Tie-break**: prefer modules that already have test coverage. Untested fork-original code is flagged ⚠ in notes — extraction is still possible but must add a smoke test in the cycle.

---

## Modules (ranked) / الوحدات مرتبة

| Rank | Module | Source path(s) | Indep. | Value | Inv.Risk | Score | Tests? | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **research-mode** | `src/services/research/` (4 files) + 3 consumers | 5 | 5 | 4 | **14** | ⚠ none | ⬜ | Fork-original. Tiny surface. Already in its own folder. Wired via singleton — easy `index.ts` boundary. |
| 2 | **browser-bridge** | `extension/` (7 files) + `src/core/api/providers/deepseek-bridge/` (2 files) + WS port-9876 server | 4 | 5 | 4 | **13** | ⚠ none | ⬜ | Fork-original, high marketing signal. Bridge folder already isolated. Extension folder is fully standalone (Chrome MV3). |
| 3 | **deepseek-providers** | `src/core/api/providers/deepseek-bridge/`, `deepseek-webapi/`, `deepseek.ts` + PoW solver | 4 | 5 | 3 | **12** | ⚠ none | ⬜ | Fork-original (incl. PoW solver). Touches the proto conversion layer (CLAUDE.md §"Adding a New API Provider"). Could be **bundled with browser-bridge** as one mega-module, but cleaner as two. |
| 4 | **command-permissions** | `src/core/permissions/` (4 files, has tests) | 5 | 3 | 5 | **13** | ✅ unit tests | ⬜ | Already self-contained with its own controller + tests. Low fork-distinctive value (similar concept exists upstream) but **ideal first-cycle dry run** if user wants a safe pilot. |
| 5 | **mcp-integration** | `src/services/mcp/` (5 files + tests + schemas) | 3 | 3 | 3 | **9** | ✅ some | ⬜ | Self-contained service but heavily consumed across task loop. Generic (Cline parity), not fork-distinctive. |
| 6 | **telemetry** | `src/services/telemetry/` (factory + providers + events) | 4 | 2 | 4 | **10** | ✅ tests | ⬜ | Clean factory pattern. Low value (generic). Could be extracted to show "provider-agnostic telemetry" story. |
| 7 | **browser-tool** | `src/services/browser/` (4 files) | 4 | 2 | 4 | **10** | ⚠ unverified | ⬜ | Note: this is the **agent's browser tool** (Puppeteer-style), distinct from `browser-bridge` (the Chrome extension for DeepSeek). Don't confuse. |
| 8 | **integrations-shell** | `src/integrations/` (terminal, editor, diagnostics, checkpoints, ...) | 2 | 3 | 2 | **7** | mixed | ⬜ | Mega-folder. Should be **split into sub-modules** before extraction, not moved wholesale. |
| 9 | **i18n-webview** | `webview-ui/src/i18n/` (does not currently exist — only locales in user_tools) + Cline `locales/` | 2 | 2 | 3 | **7** | ⚠ none | ⬜ | The user has external i18n tooling under `agint_tool_llm/user_tools/i18n/` — extraction story unclear. May need design pass first. |
| 10 | **evals** | `evals/` (already a separate workspace package) | 5 | 2 | 5 | **12** | own tests | ⬜ | Already a workspace package per root `package.json`. May be "extract" = just move out of monorepo into its own repo. Lower priority — no urgent open-source friction. |
| 11 | **slash-commands** | `src/core/slash-commands/` (only 2 files now) | 4 | 2 | 3 | **9** | ⚠ none | ⬜ | Small and self-contained but tightly tied to system-prompt variants per CLAUDE.md §"Modifying Default Slash Commands". |
| 12 | **state-management** | `src/core/storage/`, `src/shared/storage/state-keys.ts`, state-helpers | 1 | 2 | 1 | **4** | partial | 🔒 | **Do not extract.** This is the StateManager backbone described in CLAUDE.md §"StateManager Cache vs Direct globalState Access". Touching it risks silent failures across the whole app. Refactor in place if needed, don't modularize. |
| 13 | **system-prompt** | `src/core/prompts/system-prompt/` (components + variants + templates) | 1 | 3 | 1 | **5** | snapshot tests | 🔒 | Already modular internally (variants/components). Extraction would require moving snapshot tests and proto enum mappings — high risk for low gain. |
| 14 | **proto-conversion-layer** | `src/shared/proto-conversions/` + generated stubs | 1 | 1 | 1 | **3** | partial | 🔒 | Wire-format adjacent. CLAUDE.md §"Adding a New API Provider" warns explicitly about silent breakage here. Off-limits for modularization. |

> Note: scores reflect the *current* state of the codebase. As earlier modules are extracted, dependencies thin and downstream scores will rise. Re-score before each cycle.

---

## Top 3 candidates for the next cycle / أفضل 3 مرشحين للدورة القادمة

### 🥇 #1 — `research-mode` (Score 14)

**Why first**:
- Highest readiness score. Tiny surface (4 source files in `src/services/research/`, only 3 consumers in `src/core/`), already in its own folder, exported as singletons (`researchIndexer`, `researchWatcher`) so the `index.ts` boundary is trivial.
- **Fork-original** — Cline upstream has no equivalent of `.gencoder/research/INDEX.md` auto-indexing. Extracting it tells the strongest open-source story: "here is GenCoder's distinctive feature, as its own package."
- Low risk: no proto changes, no state-key plumbing, no system-prompt snapshots, no native tool calling.

**Rough scope** (high-level — not exhaustive, the analyzer will refine):
- Files moving in: `src/services/research/{ResearchIndexer,ResearchWatcher,IndexFormatter,ResearchPaths}.ts` → `src/modules/research-mode/`
- Public API: `index.ts` exporting `researchIndexer`, `researchWatcher`, types (`Manifest`, `ManifestEntry`)
- Consumers to update (3): `src/core/controller/state/rebuildResearchIndex.ts`, `src/core/controller/state/refreshResearchIndex.ts`, `src/core/task/index.ts`
- Plus the two webview commands that drive Refresh/Rebuild (verify via the controller files)

**Estimated effort**: **S** (<1 day)

**Open questions for the user**:
- ⚠ **No tests today.** Should the cycle include adding a minimal smoke test for `ResearchIndexer.run()` (recommended), or extract first and add tests in a follow-up?
- Final folder location: `src/modules/research-mode/` (matches roadmap convention) **or** `src/packages/research-mode/` (closer to npm-package style for eventual extraction-as-a-real-package)?
- Should the `.gencoder/research/` filesystem layout (which the indexer writes to) also move, or stay where it is? Recommend: stay put — that's user data, not code.

---

### 🥈 #2 — `browser-bridge` (Score 13)

**Why second**:
- Strongest fork-distinctive marketing story (free DeepSeek in an agent loop, no API key). Per `BROWSER_BRIDGE.md` research doc, this is the second-most-distinctive fork delta.
- The Chrome extension at `extension/` is **already physically isolated** — 7 files, no shared code with the VS Code side except the WS protocol on port 9876.
- The bridge server side (`src/core/api/providers/deepseek-bridge/`) is a self-contained folder with one `index.ts` (`ApiHandler`) and one `ws-server.ts`.

**Rough scope**:
- Files moving in:
  - `extension/` → either kept where it is and given a `package.json` to make it a workspace, or moved to `extension-clients/chrome-deepseek/`
  - `src/core/api/providers/deepseek-bridge/{index,ws-server}.ts` → `src/modules/deepseek-bridge/`
  - WS-server bootstrap call in `src/extension.ts:83` becomes an import from the module
- Public API: `index.ts` exporting `startBridgeServer`, `DeepSeekBridgeHandler`, `getBridgeStatus`, the bridge event bus
- Tooling: keep `test-bridge-ws.mjs` and `test_bridge.py` colocated with the module

**Estimated effort**: **M** (1-3 days — Chrome extension packaging adds friction)

**Open questions for the user**:
- Should the Chrome extension be split into its own git repo (decoupled release cadence, separate Chrome Web Store listing) or stay in-tree as a workspace?
- Does the user want this **bundled with `deepseek-providers`** (#3) into one mega-module, or kept separate? Separate is cleaner; bundled is faster.

---

### 🥉 #3 — `command-permissions` (Score 13) — **recommended as a "pilot" cycle**

**Why third (but worth considering first)**:
- **Highest inverse-risk score (5)** of any candidate. Already has unit tests. 4 files. Single controller class.
- Lower fork-distinctive value, but that's a **feature** for a pilot cycle: it lets us validate the whole 8-phase loop (plan → approve → branch → extract → verify → push → manual-test → summary) on a low-stakes module before we touch DeepSeek/research.
- Will likely surface scaffolding decisions (folder layout, `index.ts` conventions, `module-build-verifier` behaviour) that benefit every subsequent module.

**Rough scope**:
- Files moving in: `src/core/permissions/{CommandPermissionController,CommandPermissionController.test,index,types}.ts` → `src/modules/command-permissions/`
- Public API: re-export from existing `index.ts` (already exists)
- Consumers: need a `Grep` sweep — likely `src/core/task/`

**Estimated effort**: **S** (<1 day)

**Open questions for the user**:
- Do you want a **pilot cycle** with this module first, to derisk the modularization workflow itself? Or jump straight into `research-mode` for higher impact?

---

## Modules deferred (and why) / وحدات مؤجَّلة (مع السبب)

| Module | Reason for 🔒 |
|---|---|
| **state-management** | StateManager backbone. CLAUDE.md explicitly warns that missing any step in the 7-point checklist causes silent failures. The risk of breaking the whole extension by relocating this is far greater than the modularity gain. Improve in place. |
| **system-prompt** | Already internally modular (`components/` + `variants/` + `templates/`). Extraction would require moving snapshot tests across 10+ model-family variants — high risk, low gain. |
| **proto-conversion-layer** | Wire-format adjacent. Per CLAUDE.md, missing a case here causes providers to silently revert to Anthropic with no error. Off-limits for modularization. |
| **ARCHITECTURE doc (auto-generated)** | The `.gencoder/research/ARCHITECTURE.md` file is auto-generated by the indexer (per the seed list note). It's an output, not a code module. |
| **CHANGELOG entries** | Per CLAUDE.md, contributors don't create changelog entries — maintainers handle this at release time. No modular work involves CHANGELOG. |

---

## Cycle history / تاريخ الدورات

_None yet. This is the bootstrap turn._

---

## Next action / الخطوة التالية

Awaiting user pick: `research-mode` (highest impact), `browser-bridge` (highest marketing value), `command-permissions` (safest pilot), or "show me the rest." Once chosen, this roadmap is updated to mark the picked module 🟡 and the cycle proceeds to **Phase 1 — Discovery** in `modular-architect.md`.
