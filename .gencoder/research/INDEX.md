# Research Index - Cline Extension

## Last Updated: 2026-05-10

This directory contains research summaries about the Cline extension codebase to help future agents understand the project quickly without re-reading the same files.

## Available Research Files

1. **project_plan_20_stages.md** - 20-stage project setup plan for creating the base environment (empty structure, no content)
   - Stages include: project structure, Git init, package manager, TypeScript config, code quality tools, development environment, framework setup, routing, state management, styling, shared components, database connection, data schemas, API client, authentication, unit testing, E2E testing, logging/error handling, CI/CD, initial documentation

2. **ARCHITECTURE.md** - Core architecture documentation
   - High-level architecture diagram
   - Key components: Controller, Task, WebviewProvider
   - Data flow and communication patterns
   - Design patterns and best practices
   - Platform abstraction layer (HostProvider)

3. **STATE_MANAGEMENT.md** - State management system
   - File-based storage architecture
   - StorageContext, ClineFileStorage, StateManager
   - Global state, secrets, workspace state
   - Cross-platform storage under `~/.cline/data/`
   - Adding new state keys and migrations

4. **API_PROVIDERS.md** - API provider system
   - Supported providers (Anthropic, OpenRouter, Bedrock, etc.)
   - Adding new providers (8-step process)
   - Responses API providers and native tool calling
   - Proto conversion mappings (critical for persistence)
   - Plan/Act mode configuration

5. **MCP_INTEGRATION.md** - MCP server integration
   - McpHub manager for MCP connections
   - Stdio and SSE server types
   - Tool discovery and execution
   - Auto-approval settings
   - Marketplace for one-click installation

6. **TOOL_EXECUTION.md** - Tool execution system
   - Available tools (file, terminal, browser, search, MCP)
   - Approval flow and auto-approval
   - Checkpoint system (Git-based)
   - Adding new tools (8-step process)
   - Security considerations

7. **WEBVIEW_UI.md** - Webview UI architecture
   - React application in VS Code webview
   - ExtensionStateContext for state management
   - gRPC/Protobuf communication
   - Component structure (Chat, Settings, History)
   - Styling with Tailwind CSS

8. **CLI_ARCHITECTURE.md** - CLI architecture
   - Terminal-based interface with React Ink
   - Shared core extension logic
   - TUI components and state polling
   - Color handling and keyboard shortcuts
   - Provider configuration for CLI

9. **TESTING_SETUP.md** - Testing infrastructure
   - Unit tests (Mocha), integration tests, E2E (Playwright)
   - Snapshot tests for system prompts
   - Mocking utilities (fetch, storage)
   - Coverage reporting (80% threshold)
   - CI/CD with GitHub Actions

10. **BUILD_AND_DEPLOYMENT.md** - Build and deployment
    - Build system with esbuild and Vite
    - VS Code extension packaging (VSIX)
    - CLI packaging (npm)
    - GitHub Actions workflows
    - Nightly builds and releases

## Directory Structure

- `.gencoder/research/` - Research summaries (this directory)
  - `project_plan_20_stages.md` - 20-stage setup plan
  - `ARCHITECTURE.md` - Core architecture
  - `STATE_MANAGEMENT.md` - State management
  - `API_PROVIDERS.md` - API providers
  - `MCP_INTEGRATION.md` - MCP integration
  - `TOOL_EXECUTION.md` - Tool system
  - `WEBVIEW_UI.md` - UI architecture
  - `CLI_ARCHITECTURE.md` - CLI design
  - `TESTING_SETUP.md` - Testing infrastructure
  - `BUILD_AND_DEPLOYMENT.md` - Build pipeline

- Main project source: `src/`
- Webview UI: `webview-ui/`
- CLI: `cli/`
- Protobuf definitions: `proto/`
- Documentation: `docs/`
- Tests: `src/__tests__/`, `webview-ui/src/__tests__/`

## Research Status

- [x] Initial file created - project plan documented
- [x] Architecture overview
- [x] Core extension structure (Controller, Task, WebviewProvider)
- [x] State management system
- [x] API provider system
- [x] MCP integration
- [x] Plan/Act mode system
- [x] Tool execution system
- [x] Message streaming system
- [x] Testing infrastructure
- [x] CLI architecture
- [x] Webview UI components
- [x] Build and deployment process

## Next Research Steps

1. Read key source files to understand core architecture
2. Document main components: Controller, Task, WebviewProvider
3. Map data flow between extension, webview, and CLI
4. Document API provider patterns and adding new providers
5. Understand protobuf/gRPC communication layer
6. Document MCP server integration
7. Analyze storage system (StateManager, file-based storage)
8. Review system prompt and variant system
9. Document testing strategies

## Key File Locations

- **Extension entry**: `src/extension.ts`, `src/common.ts`
- **Controller**: `src/core/controller/index.ts`
- **Task**: `src/core/task/index.ts`
- **Webview provider**: `src/core/webview/index.ts`
- **State management**: `src/core/storage/StateManager.ts`, `src/shared/storage/`
- **API providers**: `src/api/providers/`
- **MCP**: `src/services/mcp/McpHub.ts`
- **Protobuf definitions**: `proto/`
- **Webview UI**: `webview-ui/src/`
- **CLI**: `cli/src/`
- **System prompts**: `src/core/prompts/system-prompt/`

## Notes for Researchers

- This is a **VS Code extension** (also supports CLI and JetBrains)
- Uses **TypeScript** across the codebase
- Communication between webview and extension uses **gRPC-like protocol** over VS Code message passing
- Storage is **file-based** under `~/.cline/data/` (not VSCode ExtensionContext)
- Always use `@/shared/net` utilities for network calls to support proxies
- Plan vs Act mode uses different system prompts and API configurations
- When modifying system prompts, regenerate snapshots with `UPDATE_SNAPSHOTS=true npm run test:unit`
- After proto changes, run `npm run protos` to regenerate TypeScript bindings