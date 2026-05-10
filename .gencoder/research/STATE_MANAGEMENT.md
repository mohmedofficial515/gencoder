# State Management System Documentation

## Overview

Cline uses a **file-based storage system** that works across all platforms (VS Code, CLI, JetBrains). This ensures consistent state management regardless of which client is used.

## Storage Architecture

### Directory Structure

```
~/.cline/
  data/
    globalState.json          # Cross-workspace settings and state
    secrets.json              # API keys and sensitive data (mode 0o600)
    tasks/
      taskHistory.json        # History of all tasks
    workspaces/
      <workspace-hash>/       # Per-workspace storage
        workspaceState.json   # Workspace-specific data
```

### Key Classes

#### 1. StorageContext (`src/shared/storage/storage-context.ts`)

Factory for creating storage instances:

```typescript
interface StorageContext {
  globalState: ClineFileStorage    // Cross-workspace storage
  secrets: ClineFileStorage        // Secure storage
  workspaceState: ClineFileStorage // Per-workspace storage
}

// Creation
const storageContext = createStorageContext({ workspacePath })
```

#### 2. ClineFileStorage (`src/shared/storage/ClineFileStorage.ts`)

Low-level JSON file storage with atomic writes:

```typescript
class ClineFileStorage {
  // Read value
  get<T>(key: string): T | undefined
  
  // Write value (atomic: write-then-rename)
  set<T>(key: string, value: T): Promise<void>
  
  // Batch write multiple keys
  setBatch(updates: Record<string, any>): Promise<void>
  
  // Delete key
  delete(key: string): Promise<void>
  
  // Get all keys
  keys(): string[]
}
```

**Atomic Write Process:**
1. Write to temporary file (`{filename}.tmp`)
2. Rename to target filename (atomic on most file systems)
3. Delete old file if exists

#### 3. StateManager (`src/core/storage/StateManager.ts`)

In-memory cache layer on top of file storage:

```typescript
class StateManager {
  private static instance: StateManager
  private cache: Map<string, any>
  private debounceTimers: Map<string, NodeJS.Timeout>
  
  // Singleton access
  static get(): StateManager
  
  // Initialize with storage context
  static async initialize(storageContext: StorageContext)
  
  // Read from cache (or disk if not cached)
  getGlobalStateKey<T>(key: string): T | undefined
  getSecretKey<T>(key: string): T | undefined
  getWorkspaceStateKey<T>(key: string): T | undefined
  
  // Write to cache and debounce to disk
  setGlobalState(key: string, value: any): Promise<void>
  setSecret(key: string, value: any): Promise<void>
  setWorkspaceState(key: string, value: any): Promise<void>
  
  // Batch operations
  setGlobalStateBatch(updates: Record<string, any>): Promise<void>
}
```

## State Categories

### 1. Global State (`globalState.json`)

Settings and data that persist across all workspaces:

```typescript
interface GlobalState {
  // Version tracking
  clineVersion: string
  lastShownAnnouncementId: string
  
  // User preferences
  apiConfiguration: ApiConfiguration
  autoApprovalSettings: AutoApprovalSettings
  terminalOutputLineLimit: number
  defaultTerminalProfile: string
  
  // Feature toggles
  terminalReuseEnabled: boolean
  vscodeTerminalExecutionMode: boolean
  
  // User data
  userInfo: UserInfo
  isNewUser: boolean
  taskHistory: HistoryItem[]
  
  // Remote config cache
  remoteConfigCache: RemoteConfig
  
  // MCP marketplace
  mcpMarketplaceCatalog: McpMarketplaceCatalog
  
  // Feature flags
  featureFlags: Record<string, boolean>
}
```

### 2. Secrets (`secrets.json`)

Sensitive information stored with restricted permissions:

```typescript
interface Secrets {
  // API keys
  apiKey?: string
  openRouterApiKey?: string
  bedrockAccessKey?: string
  bedrockSecretKey?: string
  
  // OAuth tokens
  clineAuthToken?: string
  ocaAuthToken?: string
  
  // Other secrets
  someApiSecret?: string
}
```

**Security:** File created with mode `0o600` (owner read/write only)

### 3. Workspace State (`workspaceState.json`)

Data specific to a workspace:

```typescript
interface WorkspaceState {
  // Task state
  currentTaskId?: string
  
  // Workspace preferences
  workspaceSettings: Partial<Settings>
  
  // UI state
  lastViewedTab?: string
  
  // Checkpoint state
  lastCheckpointHash?: string
}
```

## State Access Patterns

### Reading State

```typescript
// In Controller or any class with StateManager access
const stateManager = StateManager.get()

// Read global state
const apiConfig = stateManager.getGlobalStateKey("apiConfiguration")
const isNewUser = stateManager.getGlobalStateKey("isNewUser") ?? true

// Read secrets
const apiKey = stateManager.getSecretKey("apiKey")

// Read workspace state
const currentTask = stateManager.getWorkspaceStateKey("currentTaskId")
```

### Writing State

```typescript
// Write global state (debounced)
await stateManager.setGlobalState("isNewUser", false)

// Write secrets (immediate for security)
await stateManager.setSecret("apiKey", newApiKey)

// Write workspace state
await stateManager.setWorkspaceState("currentTaskId", taskId)

// Batch multiple updates
await stateManager.setGlobalStateBatch({
  "setting1": value1,
  "setting2": value2,
})
```

### State Synchronization

The StateManager automatically handles:

1. **Cross-instance sync**: When file changes externally, `onSyncExternalChange` callback triggers
2. **Debounced writes**: Default 500ms debounce to reduce I/O
3. **Retry on failure**: Automatic retry for persistence errors

## Adding New State Keys

### Step 1: Define Type

In `src/shared/storage/state-keys.ts`:

```typescript
// Add to GlobalState interface
export interface GlobalState {
  // ... existing keys
  myNewKey: string
}

// Add to Settings interface if user-configurable
export interface Settings {
  // ... existing settings
  mySetting: boolean
}

// Add to SecretKeys array if secret
export const SecretKeys = [
  // ... existing keys
  "mySecretKey",
] as const
```

### Step 2: Add Read Logic

In `src/core/storage/utils/state-helpers.ts`:

```typescript
export async function readGlobalStateFromDisk(
  context: StorageContext
): Promise<GlobalState> {
  const globalState = context.globalState
  
  return {
    // ... existing fields
    myNewKey: globalState.get<string>("myNewKey") ?? defaultValue,
  }
}
```

### Step 3: Use in Code

```typescript
// Reading
const value = StateManager.get().getGlobalStateKey("myNewKey")

// Writing
await StateManager.get().setGlobalState("myNewKey", newValue)
```

## Important Rules

### ⚠️ NEVER Use VSCode's ExtensionContext Directly

```typescript
// ❌ WRONG - VSCode specific
context.globalState.update("myKey", value)
const value = context.globalState.get("myKey")

// ✅ CORRECT - Cross-platform
await StateManager.get().setGlobalState("myKey", value)
const value = StateManager.get().getGlobalStateKey("myKey")
```

### Cross-Window State Reading at Startup

When a new window needs to read state set by another window **immediately** at startup:

```typescript
// Bypass cache and read directly from disk
const value = context.globalState.get<string>("myKey")

// NOT from StateManager cache (may not be populated yet)
// const value = StateManager.get().getGlobalStateKey("myKey") // May be stale
```

**Example:** `worktreeAutoOpenPath` uses this pattern.

### State Persistence Error Handling

StateManager includes callbacks for persistence errors:

```typescript
StateManager.get().registerCallbacks({
  onPersistenceError: async ({ error }) => {
    // Log error, don't show to user
    // Data is safe in memory and will retry
    Logger.error("Storage persistence failed:", error)
  },
  onSyncExternalChange: async () => {
    // File changed externally - refresh UI
    await controller.postStateToWebview()
  },
})
```

## Migration System

### VSCode to File Migration

On first run in VS Code, data is migrated from VSCode's native storage to file-based storage:

```typescript
// In src/extension.ts
await exportVSCodeStorageToSharedFiles(context, storageContext)
```

**Migration Process:**
1. Check sentinel `__vscodeMigrationVersion` in global state
2. If not migrated, copy data to file stores
3. Never overwrite existing file values (file wins)
4. Set migration version to prevent re-migration

### Legacy State Cleanup

Migrations for old state patterns:

```typescript
// In src/extension.ts
await cleanupLegacyVSCodeStorage(context)
```

This handles:
- Moving workspace keys to global storage
- Task history to file
- Custom instructions to global rules
- Welcome view completion state

## Performance Considerations

### Debouncing Strategy

- **Default debounce**: 500ms
- **Secrets**: Immediate write (no debounce for security)
- **Batch updates**: Single debounce for multiple keys

### Cache Invalidation

Cache is invalidated when:
- File changes on disk (watcher triggers reload)
- Manual clear via `StateManager.clearCache()`
- Extension restart

### Memory Usage

- Cache stores all state in memory
- For large data (task history), consider pagination or streaming
- Remote config cached separately with TTL

## Testing State Management

```typescript
// Mock storage for tests
import { createMockStorageContext } from "@/shared/storage/test-utils"

const mockStorage = createMockStorageContext()
await StateManager.initialize(mockStorage)

// Test state operations
await StateManager.get().setGlobalState("testKey", "testValue")
const value = StateManager.get().getGlobalStateKey("testKey")
expect(value).toBe("testValue")
```

## Troubleshooting

### State Not Persisting

1. Check if using correct StateManager methods (not VSCode context)
2. Verify file permissions on `~/.cline/data/`
3. Check for disk space or I/O errors in logs
4. Ensure `StateManager.initialize()` was called

### Cross-Instance Sync Issues

1. Verify file watchers are working
2. Check `onSyncExternalChange` callback registration
3. Ensure state is being read after sync completes

### Migration Fails

1. Check for malformed JSON in old storage
2. Verify file write permissions
3. Check migration sentinel values
4. Look for errors in extension host console

## Best Practices

1. **Always use StateManager** - Never direct file or VSCode storage access
2. **Batch related updates** - Use `setGlobalStateBatch` for multiple keys
3. **Handle defaults** - Use `?? defaultValue` when reading
4. **Don't store large data** - Use separate files for large data (e.g., task history)
5. **Secrets are immediate** - No debounce, but also slower
6. **Listen for sync events** - Register callbacks if UI needs refresh
7. **Test cross-platform** - Verify state works in CLI and JetBrains

## Related Files

- `src/shared/storage/storage-context.ts` - Storage factory
- `src/shared/storage/ClineFileStorage.ts` - File storage implementation
- `src/core/storage/StateManager.ts` - Cache and management
- `src/core/storage/state-migrations.ts` - Migration utilities
- `src/hosts/vscode/vscode-to-file-migration.ts` - VSCode migration
- `src/shared/storage/state-keys.ts` - Type definitions