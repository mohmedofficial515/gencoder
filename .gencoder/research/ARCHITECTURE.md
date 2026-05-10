# Cline Extension Architecture Documentation

## Overview

Cline is a multi-platform AI assistant extension that runs on VS Code, CLI, and JetBrains. The architecture follows a modular design with clear separation between core extension logic, platform-specific hosts, and UI components.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Extension Host Layer                      │
│  (VS Code Extension Host / CLI / JetBrains Plugin)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Host Provider                           │
│           (Platform Abstraction Layer)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Core Extension                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Controller  │  │    Task      │  │ WebviewProvider│     │
│  │ (State Mgmt) │  │ (Execution)  │  │   (UI Host)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Webview UI (React)                        │
│              (Browser-based Interface)                       │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Extension Entry Points

**`src/extension.ts`** (VS Code specific)
- Activation and deactivation lifecycle management
- Registers VS Code commands and UI providers
- Handles URI schemes for deep linking
- Sets up terminal integration and code actions
- Initializes test mode and development commands

**`src/common.ts`** (Platform-agnostic)
- Common initialization logic for all platforms
- Sets up logging, storage, and configuration
- Initializes StateManager and external services (PostHog, telemetry)
- Handles version updates and announcements
- Manages workspace setup and worktree auto-opening

### 2. Controller (`src/core/controller/index.ts`)

The Controller serves as the **single source of truth** for extension state:

**Responsibilities:**
- Manages global state, secrets, and workspace state through StateManager
- Handles task lifecycle (creation, execution, disposal)
- Coordinates MCP server connections via McpHub
- Manages authentication (AuthService, OcaAuthService)
- Provides API configuration management
- Handles remote configuration fetching
- Posts state updates to the webview

**Key Properties:**
```typescript
class Controller {
  task?: Task                    // Current active task
  mcpHub: McpHub                 // MCP server manager
  stateManager: StateManager     // Persistent storage
  workspaceManager?: WorkspaceRootManager  // Multi-root workspace support
  accountService: ClineAccountService
  authService: AuthService
  ocaAuthService: OcaAuthService
}
```

**Key Methods:**
- `initTask()` - Creates and initializes a new task
- `clearTask()` - Disposes current task and cleans up
- `postStateToWebview()` - Sends current state to UI
- `handleSignOut()` - Handles user logout
- `dispose()` - Cleanup on extension deactivation

### 3. Task (`src/core/task/index.ts`)

The Task class handles **AI request execution and tool management**:

**Responsibilities:**
- Manages API request streaming and retry logic
- Executes tools with approval flow
- Handles context window management (truncation)
- Creates checkpoints for file changes (Git-based)
- Manages terminal sessions and browser automation
- Handles task persistence and resumption

**Execution Flow:**
```
1. User provides input
2. Task initiates API request loop
3. Streams response chunks
4. Parses content blocks (text/tool_use)
5. Executes tools with user approval
6. Returns results to API
7. Continues loop until completion
```

**Key Features:**
- **Streaming**: Real-time chunk processing with race condition prevention
- **Context Management**: Automatic conversation truncation based on model limits
- **Error Recovery**: Automatic retry for transient failures with user fallback
- **Checkpoints**: Git-based snapshots after each tool execution
- **Task Resumption**: Can resume interrupted tasks from saved state

### 4. WebviewProvider (`src/core/webview/index.ts`)

Manages the webview UI lifecycle and communication:

**Responsibilities:**
- Creates and manages webview instances
- Handles message passing between extension and webview
- Manages multiple active webview instances
- Supports both sidebar and tab panel webviews
- Implements HMR support for development

**Communication Pattern:**
```
Webview (React) <--postMessage--> WebviewProvider <--> Controller
```

### 5. State Management (`src/core/storage/StateManager.ts`)

**File-based storage** under `~/.cline/data/`:

**Storage Locations:**
- `globalState.json` - Cross-workspace settings
- `secrets.json` - API keys (mode 0o600)
- `workspaceState.json` - Per-workspace data
- `tasks/taskHistory.json` - Task history

**Caching Strategy:**
- In-memory cache for all reads
- Debounced writes to disk (500ms)
- Automatic retry on persistence failures

**Access Pattern:**
```typescript
// Reading
StateManager.get().getGlobalStateKey("key")

// Writing
StateManager.get().setGlobalState("key", value)
```

### 6. API Provider System (`src/api/providers/`)

Modular provider system supporting multiple AI services:

**Supported Providers:**
- Anthropic (Claude)
- OpenRouter
- AWS Bedrock
- Gemini (Google)
- Cerebras
- Ollama (local)
- LM Studio (local)
- VSCode LM
- OpenAI Codex (Responses API)
- DeepSeek

**Provider Registration:**
To add a new provider, update:
1. `proto/cline/models.proto` - Add to ApiProvider enum
2. `src/shared/proto-conversions/models/api-configuration-conversion.ts` - Add mappings
3. `src/shared/api.ts` - Add models and configuration
4. `src/core/api/index.ts` - Register handler in `createHandlerForProvider()`

### 7. MCP Integration (`src/services/mcp/McpHub.ts`)

Manages Model Context Protocol servers:

**Features:**
- Discovers and connects to MCP servers (stdio/SSE)
- Monitors server health and handles reconnection
- Provides tools and resources from connected servers
- Supports auto-approval settings per tool
- Manages marketplace catalog for one-click installation

### 8. Host Provider System (`src/hosts/`)

Platform abstraction layer:

**Hosts:**
- `vscode/` - VS Code implementation
- `cli/` - CLI implementation (future)
- `jetbrains/` - JetBrains implementation (future)

**Key Abstractions:**
- `HostProvider` - Factory for platform-specific instances
- `WebviewProvider` - Platform-specific webview creation
- `TerminalManager` - Terminal command execution
- `Workspace` - File system and workspace management
- `Window` - UI dialogs and notifications

## Communication Protocol (gRPC/Protobuf)

The extension uses **protocol buffers** for type-safe communication:

**Proto Directory:** `proto/`
- `proto/cline/` - Core extension services
- `proto/host/` - Host platform services

**Code Generation:**
```bash
npm run protos  # Generates TypeScript bindings
```

**Adding New RPC:**
1. Add message definition in `.proto` file
2. Run `npm run protos`
3. Implement handler in `src/core/controller/<domain>/`
4. Call from webview via generated client

## System Prompt System (`src/core/prompts/system-prompt/`)

Modular, model-specific prompt generation:

**Components:**
- `components/` - Reusable prompt sections (rules, capabilities, tools)
- `variants/` - Model-specific configurations
  - `generic/` - Default fallback
  - `next-gen/` - Claude 4, GPT-5, Gemini 2.5
  - `xs/` - Local/small models
  - `hermes/`, `glm/` - Specialized models
- `templates/` - Template engine with placeholders

**Adding Tools:**
1. Add to `ClineDefaultTool` enum in `src/shared/tools.ts`
2. Create tool definition in `src/core/prompts/system-prompt/tools/`
3. Register in `tools/init.ts`
4. Add to variant configs (or rely on GENERIC fallback)
5. Create handler in `src/core/task/tools/handlers/`

**Testing:**
```bash
UPDATE_SNAPSHOTS=true npm run test:unit
```

## Plan/Act Mode System

Dual-mode operation with separate configurations:

- **Plan Mode**: Information gathering, planning, using `plan_mode_respond` tool
- **Act Mode**: Execution using all available tools

**Features:**
- Separate model configurations per mode
- Different system prompts for each mode
- State preserved when switching modes

## Data Flow

### Starting a New Task
```
1. User clicks "+" button
2. Controller.initTask() called
3. Task instance created
4. Task initiates API request loop
5. Webview shows streaming response
6. Tools executed with approval
7. State saved after each step
```

### State Updates
```
Webview Action → Controller → StateManager.update()
                ↓
          postStateToWebview()
                ↓
          Webview re-renders
```

## Key Design Patterns

1. **Singleton**: StateManager, McpHub, AuthService
2. **Factory**: HostProvider, API handler creation
3. **Observer**: State change listeners, telemetry events
4. **Strategy**: Different system prompt variants per model
5. **Command**: VS Code command registration
6. **Proxy**: Network utilities for proxy support

## Important Rules from .clinerules

### Network Calls
- **Never** use global `fetch` - use `@/shared/net` wrapper
- Always pass `fetch` to third-party clients (OpenAI, etc.)
- Use `getAxiosSettings()` for axios requests

### Storage
- **Never** use VSCode's `context.globalState` directly
- Always use `StateManager.get().setGlobalState()`
- File-based storage ensures cross-platform compatibility

### Adding New Global State Keys
1. Add type to `src/shared/storage/state-keys.ts`
2. Read from disk in `state-helpers.ts`
3. StateManager handles cache and writes

### Adding API Providers
1. Update proto enum and conversions (critical)
2. Add to `src/shared/api.ts`
3. Register handler in `src/core/api/index.ts`
4. Update webview provider utilities

### Modifying System Prompt
1. Identify variant tier (next-gen/generic/xs)
2. Modify component or variant template
3. Regenerate snapshots with test command

## Security Considerations

- API keys stored in `secrets.json` (mode 0o600)
- Proxy support for corporate environments
- `.clineignore` file prevents access to sensitive files
- Workspace isolation through path restrictions

## Performance Optimizations

- Debounced state persistence (500ms)
- In-memory caching for storage reads
- Lazy initialization of workspace manager
- Background task for remote config fetching (1-hour interval)
- Periodic cleanup of temp files (24 hours)

## Testing Infrastructure

- Unit tests: `npm run test:unit`
- E2E tests: `npm run test:e2e`
- Snapshot tests for system prompts
- Mock fetch for network testing

## Development Workflow

1. **Build Protos**: `npm run protos`
2. **Compile**: `npm run compile`
3. **Test**: `npm run test:unit`
4. **Run Extension**: F5 in VS Code (debug mode)

## Related Documentation

- `.clinerules/cli.md` - CLI development guidelines
- `.clinerules/general.md` - Tribal knowledge and patterns
- `.clinerules/network.md` - Proxy and network handling
- `.clinerules/protobuf-development.md` - Adding RPC endpoints
- `.clinerules/storage.md` - Storage architecture details