# research-mode

A self-contained module that maintains a live project index for GenCoder.

It scans the workspace, computes per-file metadata (SHA-256, LOC, mtime), and
writes human-readable summaries to `.gencoder/research/` alongside a binary
manifest cache. A debounced `chokidar` watcher keeps the index fresh while the
user edits files. Consumers — the two `StateService` RPC handlers and the
post-task hook in the task runner — interact with this module exclusively
through its public surface.

## Public API

```ts
import { researchIndexer, researchWatcher } from "@packages/research-mode"
import type { Manifest, ManifestEntry } from "@packages/research-mode"
```

Two singletons and two types — that's the whole contract.

### `researchIndexer`
- `rebuild(workspacePath)` — full scan from scratch; rewrites `INDEX.md`,
  `ARCHITECTURE.md`, and `manifest.json`.
- `refresh(workspacePath)` — incremental update based on mtime + SHA-256;
  falls back to `rebuild()` if no prior scan exists.
- `refreshFile(workspacePath, absFilePath)` — single-file update used by
  targeted hooks.
- `loadManifest(workspacePath)` — read the on-disk manifest.

### `researchWatcher`
- `watch(workspacePath)` — start watching with a 30-second debounce; flushes
  via `researchIndexer.refresh()`.
- `stop(workspacePath)` / `dispose()` — release watchers/timers.

## Usage

The three current consumers each do roughly:

```ts
researchWatcher.watch(workspacePath)
await researchIndexer.rebuild(workspacePath)   // or refresh(...)
```

`webview-ui` does NOT import this module directly — it goes through the
generated `StateServiceClient` RPC bindings.

## Standalone testability

The module has zero inbound dependencies on `@/core/*`, `@/integrations/*`,
proto-generated code, or `webview-ui`. It depends only on:

- `@services/glob/list-files` (a generic file-walk utility)
- `@/shared/services/Logger` (a global logger singleton)
- Node built-ins (`crypto`, `fs/promises`, `path`)
- `chokidar` (third-party fs watcher)

That means a future cycle can lift this module into its own npm workspace
with minimal effort: stub `Logger`, vendor or extract `listFiles`, and the
module ships independently.

## Storage layout

Output lives in the user's workspace under `.gencoder/research/`:

```
.gencoder/research/
├── INDEX.md            # human-readable index, grouped by top-level dir
├── ARCHITECTURE.md     # tech stack + layout overview
└── .cache/
    └── manifest.json   # SHA-256 + mtime per file (gitignored)
```

The cache directory is automatically appended to `.gitignore` on first
rebuild.

## Open-source friendly notes

- No GenCoder-proprietary types in the public API.
- No proto messages; the two RPCs that drive this module live in
  `proto/cline/state.proto` and stay there — only their handlers import
  this package.
- No state-key plumbing; nothing in `globalState` or `Settings` references
  the module.
- Suitable for extraction to a standalone npm package after the facade
  refactor (deferred to a later cycle per `PLAN.md §10 Q3`).
