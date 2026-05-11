# Manual Test Plan — Onboarding

**Branch**: `design/onboarding`
**SPEC**: `.planning/design/onboarding/SPEC.md`
**Date generated**: 2026-05-11

This is the user-gated verification step before opening the PR. Reply with:
- `passed` if every test below is ✅
- `failed: <test#> — <one line>` for any failure
- `pause` if you want to step away and resume later

---

## Pre-test setup

1. Check out the branch:
   ```powershell
   git checkout design/onboarding
   ```
2. Compile the extension:
   ```powershell
   npm run compile
   ```
3. Open the repo in VS Code and press **F5** to launch the Extension Development Host.
4. Reset the welcome flag so onboarding triggers on next open:
   - Open the Command Palette (Ctrl+Shift+P) in the **Extension Development Host window** (not the main one).
   - Run `Developer: Show Running Extensions` → find GenCoder → reload extension OR
   - Easier path: from the regular VS Code window, run `Developer: Reload Window` after manually clearing storage via the GenCoder settings → "Reset / sign out" if available, or use the secret `mohmedofficial515.gencoder` storage key.
5. Open the GenCoder side panel. You should land on the onboarding flow (step 0 — "How will you use GenCoder?").

If the onboarding doesn't appear, you've still completed it — sign out from the account section first, then reload.

---

## Test 1 — Light VS Code theme, **keyboard-only**

**Theme**: VS Code → Preferences → Color Theme → "Default Light Modern" (or any other Light theme).

| Step | Action | Expected |
|---|---|---|
| 1.1 | Reload to land on onboarding step 0. Close all popups, click outside the panel, then `Tab` into the GenCoder panel. | Focus eventually lands on the first user-type card ("Free"). A visible focus ring appears around it. |
| 1.2 | Press `ArrowDown`. | Focus + selection moves to the second card ("Premium models"). The radio glyph swaps to a filled check on the new card. |
| 1.3 | Press `ArrowDown` again. | Selection moves to "Use my own API key". |
| 1.4 | Press `ArrowDown` again. | Selection wraps back to "Free". (Wrap-around is intended.) |
| 1.5 | Press `Home`. | Selection goes to "Free" (first option). |
| 1.6 | Press `End`. | Selection goes to "Use my own API key" (last option). |
| 1.7 | Press `ArrowUp` from "Free". | Wraps to "Use my own API key". |
| 1.8 | With "Free" selected, press `Tab`. | Focus leaves the radiogroup and lands on the next interactive control (the "Continue" primary button). |
| 1.9 | With "Free" selected, press `Enter` on the focused "Continue" button. | Advances to step 1 ("Select a free model"). The StepDots show dot 2 of 3 filled. The "You can change this later in settings" hint is **gone** (it should only appear on step 0). |
| 1.10 | Press `Tab` until focus is on the model list. | Focus lands on the first selectable model card; visible focus ring. |
| 1.11 | Press `ArrowDown` / `ArrowUp` repeatedly. | Selection cycles through all visible model cards (including any models added by the search input area). The "Recommended" badge stays on the appropriate model. |
| 1.12 | Press `Tab` to leave the model group. | Focus reaches the "More models" search input. |
| 1.13 | Press `Tab` again. | Focus reaches "Create my Account" (primary button). |
| 1.14 | Press `Shift+Tab` back through the form. | Reverse traversal works the same way. |
| 1.15 | Hit `Escape` → reload → start over. Confirm nothing in the keyboard-only flow required a mouse. | ✅ |

---

## Test 2 — Dark VS Code theme

Switch to **Default Dark Modern**.

| Step | Action | Expected |
|---|---|---|
| 2.1 | Reload onboarding. | Layout, spacing, and focus rings remain identical to Test 1. Selected card uses `var(--vscode-button-background)` border — visible against the darker background. |
| 2.2 | Repeat tests 1.1-1.14 (keyboard-only). | All pass identically. |
| 2.3 | Hover (mouse) over an unselected card. | Background becomes `bg-input-background/40` — a subtle but visible distinction from the unhovered state. |

---

## Test 3 — High-contrast theme

Switch to **Default High Contrast** (or **Default High Contrast Light**).

| Step | Action | Expected |
|---|---|---|
| 3.1 | Reload onboarding. | All text in the cards is readable (no `text-foreground/70` opacity tricks — the muted text now uses `var(--vscode-descriptionForeground)`). |
| 3.2 | Selected card border. | The selected border is the high-contrast accent color, clearly distinct from idle borders. |
| 3.3 | StepDots active dot. | Visible against the background; inactive dots are also still visible (not invisible). |
| 3.4 | Focus ring. | High-contrast theme's focus indicator is clearly visible on every interactive element. |

---

## Test 4 — `prefers-reduced-motion`

Set the OS-level reduced motion preference:
- **Windows**: Settings → Accessibility → Visual effects → toggle off "Animation effects".
- **macOS**: System Settings → Accessibility → Display → "Reduce motion" on.
- **Linux**: depends on DE; or use VS Code DevTools to emulate.

Reload the panel.

| Step | Action | Expected |
|---|---|---|
| 4.1 | Reload onboarding. Switch between user-type cards. | The card background does **not** animate during the color change — it snaps. (This is the `motion-safe:transition-colors` behavior.) |
| 4.2 | Click "Continue" → "Create my Account" to enter step 2. | The loading button on step 2 does **not** pulse. |
| 4.3 | Look at the spinner on step 2. | The `LoaderCircleIcon` does **not** spin — it shows as a static icon. (The `motion-safe:animate-spin` is gated.) |
| 4.4 | Look at the StepDots when navigating between steps. | Color transitions are instant (no fade). |

Re-enable motion before continuing.

---

## Test 5 — OAuth error surfaced via Alert

Goal: trigger a real OAuth failure to confirm the destructive Alert renders.

**Easiest reproduction**: turn off internet (airplane mode / disconnect Wi-Fi) before clicking the auth button.

| Step | Action | Expected |
|---|---|---|
| 5.1 | On step 0 with "Free" selected, click "Continue". | Land on step 1 (model selection). |
| 5.2 | Disconnect from the network. | (No UI change yet.) |
| 5.3 | Click "Create my Account". | The flow attempts to advance to step 2, then **rolls back** to step 1, and a red `Alert` appears above the action buttons titled "Sign-in failed" with a body message and a `Retry` button. |
| 5.4 | Reconnect to the network. Click `Retry` inside the Alert. | The Alert dismisses; the auth flow re-runs from the same `signup` action; on success you advance to step 2. |
| 5.5 | If `Retry` works only after re-clicking "Create my Account", that's also fine — but the Alert must visibly disappear before the next attempt. | ✅ |

Alternative if you can't easily go offline: open DevTools (Help → Toggle Developer Tools), go to the Network tab, set throttling to "Offline", then click the auth button.

---

## Test 6 — Fallback "Browser didn't open?" link

| Step | Action | Expected |
|---|---|---|
| 6.1 | Get to step 2 (the "Almost there!" screen). The easy way: click "Login to GenCoder" on step 0, which goes straight to step 2. | The screen shows the spinner, the description "We opened your browser to finish sign-in. …", and below the "Back" button there is an underlined link **"Browser didn't open? Try again."** |
| 6.2 | Tab to the fallback link. | It's keyboard-focusable and shows a focus ring. |
| 6.3 | Press `Enter` (or click). | The link calls `retryAuth` — the same as the Alert's Retry button. The browser is launched again. |
| 6.4 | While `isActionLoading` is true, the link should appear disabled (50% opacity, `not-allowed` cursor). | ✅ |

---

## Test 7 — Regression sweep (everything that wasn't supposed to change)

| Step | Action | Expected |
|---|---|---|
| 7.1 | On step 1 with "Premium models" selected, type into the "More models" search input. | Search results appear within the radiogroup; each result is keyboard-focusable. |
| 7.2 | Pick a search result. | The card gets the unified selected-state border. The "Create my Account" button is enabled. |
| 7.3 | Clear the search field (delete all text). | Selection drops back to the original group's first model. The empty-results message is **not** shown when the search is empty. |
| 7.4 | Type a nonsense query like "zzznotamodel". | The empty-results message reads: `No models found for "zzznotamodel". Try a different name.` |
| 7.5 | On step 0, choose "Use my own API key" → click "Continue". | Lands on the BYOK provider configuration (`ApiConfigurationSection`) — unchanged from before. |
| 7.6 | Configure a provider via BYOK and click "Continue" (which fires the `done` action). | Onboarding completes; you reach the chat view. |
| 7.7 | Reload the panel. | You should NOT see onboarding again — the welcome-completed flag is set. |
| 7.8 | The footer hint "You can change this later in settings" should appear ONLY on step 0. | ✅ Confirm by visiting steps 1 and 2 — no hint. |

---

## Acceptance summary

For `passed` reply, all of:
- ✅ Tests 1-3 — keyboard nav works in light, dark, and high-contrast themes
- ✅ Test 4 — animations respect reduced-motion
- ✅ Test 5 — OAuth error surfaces via Alert + Retry
- ✅ Test 6 — fallback link works
- ✅ Test 7 — regression-clean (search, BYOK path, single-place footer hint)

After your `passed`, the next user gate is "open the PR" — separate confirmation.
