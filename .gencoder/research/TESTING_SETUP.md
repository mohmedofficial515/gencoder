# Testing Setup Documentation

## Overview

Cline has a comprehensive testing strategy covering unit tests, integration tests, E2E tests, and snapshot tests. The testing infrastructure supports both the core extension and the webview UI.

## Testing Pyramid

```
                    ┌─────────────┐
                    │   E2E Tests │
                    │ (Playwright)│
                    └─────────────┘
                         ▲
                    ┌─────────────┐
                    │ Integration │
                    │   Tests     │
                    └─────────────┘
                         ▲
                    ┌─────────────┐
                    │  Unit Tests │
                    │ (Jest/Vitest)│
                    └─────────────┘
```

## Test Configuration Files

### Main Test Configuration

```json
// package.json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:e2e",
    "test:unit": "cross-env NODE_ENV=test mocha --config .mocharc.json",
    "test:integration": "cross-env NODE_ENV=test mocha --config .mocharc.integration.json",
    "test:e2e": "playwright test",
    "test:snapshots": "UPDATE_SNAPSHOTS=true npm run test:unit",
    "test:coverage": "nyc npm run test:unit"
  }
}
```

### Mocha Configuration

```javascript
// .mocharc.json
{
  "extension": ["ts"],
  "spec": "src/**/*.test.ts",
  "require": ["ts-node/register", "tsconfig-paths/register", "source-map-support/register"],
  "recursive": true,
  "timeout": 10000,
  "exit": true
}
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./src/test/e2e",
  timeout: 30000,
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } }
  ]
})
```

## Unit Tests

### Structure

```
src/__tests__/
├── unit/
│   ├── core/
│   │   ├── controller.test.ts
│   │   ├── task.test.ts
│   │   └── state-manager.test.ts
│   ├── api/
│   │   └── providers.test.ts
│   └── utils/
│       └── path.test.ts
└── fixtures/
    └── mock-data.ts
```

### Test Example

```typescript
// src/__tests__/unit/core/state-manager.test.ts
import { expect } from "chai"
import { describe, it, beforeEach, afterEach } from "mocha"
import { StateManager } from "@/core/storage/StateManager"
import { createMockStorageContext } from "@/shared/storage/test-utils"

describe("StateManager", () => {
  let stateManager: StateManager
  let mockStorage: any

  beforeEach(async () => {
    mockStorage = createMockStorageContext()
    await StateManager.initialize(mockStorage)
    stateManager = StateManager.get()
  })

  afterEach(async () => {
    await stateManager.clearCache()
  })

  describe("setGlobalState", () => {
    it("should store and retrieve string values", async () => {
      await stateManager.setGlobalState("testKey", "testValue")
      const value = stateManager.getGlobalStateKey("testKey")
      expect(value).to.equal("testValue")
    })

    it("should store and retrieve object values", async () => {
      const obj = { foo: "bar", num: 42 }
      await stateManager.setGlobalState("testObj", obj)
      const value = stateManager.getGlobalStateKey("testObj")
      expect(value).to.deep.equal(obj)
    })

    it("should return undefined for non-existent keys", () => {
      const value = stateManager.getGlobalStateKey("nonExistent")
      expect(value).to.be.undefined
    })
  })

  describe("setSecret", () => {
    it("should store secrets securely", async () => {
      await stateManager.setSecret("apiKey", "secret123")
      const value = stateManager.getSecretKey("apiKey")
      expect(value).to.equal("secret123")
    })
  })
})
```

## Integration Tests

### Structure

```
src/__tests__/
├── integration/
│   ├── api-handler.test.ts
│   ├── mcp-hub.test.ts
│   └── task-execution.test.ts
```

### Test Example

```typescript
// src/__tests__/integration/task-execution.test.ts
import { expect } from "chai"
import { describe, it, beforeEach } from "mocha"
import { Controller } from "@/core/controller"
import { createTestController } from "../fixtures/test-controller"

describe("Task Execution Integration", () => {
  let controller: Controller

  beforeEach(async () => {
    controller = await createTestController()
  })

  it("should execute a simple task", async () => {
    const taskId = await controller.initTask("Hello, world!")
    expect(taskId).to.be.a("string")
    
    const state = controller.getStateToPostToWebview()
    expect(state.messages).to.have.length.greaterThan(0)
  })

  it("should handle tool execution", async () => {
    await controller.initTask("Read the file test.txt")
    
    // Wait for task to process
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const state = controller.getStateToPostToWebview()
    const lastMessage = state.messages[state.messages.length - 1]
    
    expect(lastMessage.type).to.equal("tool_use")
    expect(lastMessage.name).to.equal("read_file")
  })
})
```

## E2E Tests with Playwright

### Structure

```
src/test/e2e/
├── basic-chat.spec.ts
├── settings.spec.ts
├── mcp-integration.spec.ts
└── fixtures/
    └── test-workspace/
```

### Test Example

```typescript
// src/test/e2e/basic-chat.spec.ts
import { test, expect } from "@playwright/test"
import { activateExtension, getVSCodePage } from "./fixtures/vscode"

test.describe("Basic Chat Functionality", () => {
  let page: any

  test.beforeEach(async () => {
    page = await getVSCodePage()
    await activateExtension(page)
  })

  test("should send and receive messages", async () => {
    // Find chat input
    const chatInput = await page.locator('[data-testid="chat-input"]')
    await chatInput.fill("Hello, Cline!")
    await chatInput.press("Enter")
    
    // Wait for response
    const response = await page.locator('[data-testid="assistant-message"]').first()
    await expect(response).toBeVisible()
    
    const responseText = await response.textContent()
    expect(responseText).toContain("Hello")
  })

  test("should execute file read tool", async () => {
    // Type command
    const chatInput = await page.locator('[data-testid="chat-input"]')
    await chatInput.fill("Read the file package.json")
    await chatInput.press("Enter")
    
    // Wait for tool approval dialog
    const approvalDialog = await page.locator('[data-testid="tool-approval"]')
    await expect(approvalDialog).toBeVisible()
    
    // Click approve
    const approveButton = await page.locator('[data-testid="approve-button"]')
    await approveButton.click()
    
    // Wait for result
    const result = await page.locator('[data-testid="tool-result"]').first()
    await expect(result).toBeVisible()
    expect(await result.textContent()).toContain("name")
  })
})
```

## Snapshot Tests for System Prompts

### Running Snapshot Tests

```bash
# Update snapshots
UPDATE_SNAPSHOTS=true npm run test:unit

# Run without updating
npm run test:unit
```

### Snapshot Example

```typescript
// src/__tests__/unit/prompts/system-prompt.test.ts
import { expect } from "chai"
import { describe, it } from "mocha"
import { getSystemPrompt } from "@/core/prompts/system-prompt"
import { ModelFamily } from "@/core/prompts/system-prompt/variants/types"

describe("System Prompt Snapshots", () => {
  it("should match snapshot for generic model", () => {
    const prompt = getSystemPrompt(ModelFamily.GENERIC)
    expect(prompt).to.matchSnapshot()
  })

  it("should match snapshot for next-gen model", () => {
    const prompt = getSystemPrompt(ModelFamily.NEXT_GEN)
    expect(prompt).to.matchSnapshot()
  })

  it("should match snapshot for XS model", () => {
    const prompt = getSystemPrompt(ModelFamily.XS)
    expect(prompt).to.matchSnapshot()
  })
})
```

## Webview UI Tests

### Component Tests with React Testing Library

```tsx
// webview-ui/src/__tests__/components/chat/ChatRow.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { ChatRow } from "../../../components/chat/ChatRow"

describe("ChatRow", () => {
  it("renders user message correctly", () => {
    const message = {
      id: "1",
      role: "user",
      text: "Hello world"
    }
    
    render(<ChatRow message={message} isLast={true} />)
    
    expect(screen.getByText("Hello world")).toBeInTheDocument()
    expect(screen.getByText("You:")).toBeInTheDocument()
  })

  it("renders assistant message correctly", () => {
    const message = {
      id: "2",
      role: "assistant",
      text: "I can help with that"
    }
    
    render(<ChatRow message={message} isLast={true} />)
    
    expect(screen.getByText("I can help with that")).toBeInTheDocument()
    expect(screen.getByText("Cline:")).toBeInTheDocument()
  })

  it("shows spinner when generating", () => {
    const message = {
      id: "3",
      type: "say",
      say: "generate_explanation",
      text: JSON.stringify({ status: "generating" })
    }
    
    render(<ChatRow message={message} isLast={true} />)
    
    expect(screen.getByTestId("spinner")).toBeInTheDocument()
  })
})
```

## Mocking Utilities

### Mock Fetch for Network Tests

```typescript
// src/__tests__/helpers/mock-fetch.ts
import { mockFetchForTesting } from "@/shared/net"

export function withMockFetch(mockImplementation: any, testFn: () => Promise<void>) {
  return mockFetchForTesting(mockImplementation, testFn)
}

// Usage
it("should handle API response", async () => {
  const mockFetch = async (url: string) => {
    if (url.includes("api.anthropic.com")) {
      return {
        ok: true,
        json: async () => ({ content: "Mock response" })
      }
    }
    throw new Error("Unknown URL")
  }
  
  await withMockFetch(mockFetch, async () => {
    const result = await callAnthropicAPI()
    expect(result).to.equal("Mock response")
  })
})
```

### Mock Storage for Tests

```typescript
// src/__tests__/helpers/mock-storage.ts
import { createMockStorageContext } from "@/shared/storage/test-utils"

export async function createTestStateManager() {
  const mockStorage = createMockStorageContext()
  await StateManager.initialize(mockStorage)
  return StateManager.get()
}
```

## Test Coverage

### Running Coverage

```bash
npm run test:coverage
```

### Coverage Configuration

```json
// .nycrc.unit.json
{
  "extends": "@istanbuljs/nyc-config-typescript",
  "all": true,
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/__tests__/**"],
  "reporter": ["text", "html", "lcov"],
  "check-coverage": true,
  "branches": 80,
  "lines": 80,
  "functions": 80,
  "statements": 80
}
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - run: npm ci
      
      - run: npm run test:unit
      
      - run: npm run test:integration
      
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Debugging Tests

### VS Code Debug Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Unit Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test:unit", "--", "--inspect-brk"],
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug E2E Tests",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["playwright", "test", "--debug"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Best Practices

### Test Organization

1. **Unit tests**: Test individual functions/classes in isolation
2. **Integration tests**: Test component interactions
3. **E2E tests**: Test complete user workflows
4. **Snapshot tests**: Validate system prompt outputs

### Naming Conventions

- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`
- E2E tests: `*.spec.ts`
- Test fixtures: `*.fixture.ts`

### What to Test

- **Core logic**: State management, API handlers, tool execution
- **Edge cases**: Error handling, timeouts, retries
- **Cross-platform**: Storage, file paths, terminal commands
- **Performance**: Large file handling, streaming

### What NOT to Test

- Third-party library internals
- VS Code API bindings (mock instead)
- React component styling (test behavior only)

## Related Files

- `package.json` - Test scripts
- `.mocharc.json` - Mocha configuration
- `playwright.config.ts` - E2E configuration
- `.nycrc.unit.json` - Coverage configuration
- `src/__tests__/` - Test files
- `webview-ui/src/__tests__/` - Webview tests