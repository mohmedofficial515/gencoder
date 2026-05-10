# CLI Architecture Documentation

## Overview

Cline CLI is a terminal-based interface for Cline that runs without VS Code. It shares the same core extension logic but uses a React Ink-based TUI (Terminal User Interface) instead of a webview.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Application                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              CLI Entry Point (cli/src/)               │   │
│  │         (Arg parsing, setup, main loop)               │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Core Extension (shared with VS Code)        │   │
│  │         (Controller, Task, StateManager, etc.)        │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           React Ink TUI Components                    │   │
│  │         (Terminal-based React rendering)              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
cli/
├── src/
│   ├── index.ts                 # CLI entry point
│   ├── cli.ts                   # Command line parsing
│   ├── components/              # React Ink components
│   │   ├── App.tsx              # Main TUI app
│   │   ├── ChatView.tsx         # Chat interface
│   │   ├── SettingsPanel.tsx    # Settings UI
│   │   ├── ModelPicker.tsx      # Model selection
│   │   └── Spinner.tsx          # Loading indicators
│   ├── hooks/                   # Custom React hooks
│   ├── utils/                   # CLI utilities
│   ├── constants/               # Constants and config
│   │   └── colors.ts            # Terminal color constants
│   └── types/                   # TypeScript definitions
├── man/                         # Man pages
├── scripts/                     # Build scripts
├── package.json
├── tsconfig.json
├── tsconfig.lib.json
├── vitest.config.ts
└── README.md
```

## Entry Point

```typescript
// cli/src/index.ts
#!/usr/bin/env node

import { program } from "commander"
import { startCLI } from "./cli"

program
  .name("cline")
  .description("Cline CLI - AI assistant in your terminal")
  .version("1.0.0")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --provider <provider>", "API provider")
  .option("-k, --api-key <key>", "API key")
  .option("-w, --workspace <path>", "Workspace directory")
  .option("--plan-mode", "Start in plan mode")
  .option("--no-auto-approve", "Disable auto-approval")
  .argument("[task]", "Initial task description")
  .action(startCLI)

program.parse()
```

## Main CLI Flow

```typescript
// cli/src/cli.ts
import { render } from "ink"
import React from "react"
import { App } from "./components/App"
import { initializeCore } from "./utils/initialize"
import { parseCliOptions } from "./utils/options"

export async function startCLI(task: string | undefined, options: any) {
  // 1. Initialize core extension (same as VS Code)
  const { controller, storageContext } = await initializeCore({
    workspacePath: options.workspace || process.cwd(),
    cliMode: true
  })
  
  // 2. Parse CLI options into settings
  const settings = parseCliOptions(options)
  
  // 3. Apply settings
  if (settings.apiProvider) {
    await controller.stateManager.setGlobalState("apiConfiguration", {
      apiProvider: settings.apiProvider,
      modelId: settings.model,
      apiKey: settings.apiKey
    })
  }
  
  // 4. Render TUI
  const { waitUntilExit } = render(
    <App
      controller={controller}
      initialTask={task}
      settings={settings}
    />
  )
  
  // 5. Wait for exit
  await waitUntilExit()
  
  // 6. Cleanup
  await controller.dispose()
}
```

## React Ink Components

### App Component

```tsx
// cli/src/components/App.tsx
import React, { useState, useEffect } from "react"
import { Box, Text, Newline } from "ink"
import { ChatView } from "./ChatView"
import { SettingsPanel } from "./SettingsPanel"
import { useExtensionState } from "../hooks/useExtensionState"

export const App: React.FC<AppProps> = ({ controller, initialTask, settings }) => {
  const [activeTab, setActiveTab] = useState<"chat" | "settings">("chat")
  const { state, sendMessage } = useExtensionState(controller)
  
  // Start initial task if provided
  useEffect(() => {
    if (initialTask) {
      sendMessage({ type: "initTask", task: initialTask })
    }
  }, [])
  
  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      process.exit(0)
    }
    if (input === "s") {
      setActiveTab(activeTab === "chat" ? "settings" : "chat")
    }
  })
  
  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" padding={1}>
        <Text color="cyan">Cline CLI v{state.version}</Text>
        <Text> | </Text>
        <Text color="green">Model: {state.apiConfiguration.modelId}</Text>
        <Text> | </Text>
        <Text>
          Mode: <Text color={state.mode === "plan" ? "yellow" : "green"}>
            {state.mode}
          </Text>
        </Text>
      </Box>
      
      {activeTab === "chat" ? (
        <ChatView controller={controller} state={state} />
      ) : (
        <SettingsPanel controller={controller} state={state} />
      )}
      
      <Box borderStyle="single" padding={1}>
        <Text dimColor>
          [s] Settings | [Ctrl+C] Exit
        </Text>
      </Box>
    </Box>
  )
}
```

### Chat View

```tsx
// cli/src/components/ChatView.tsx
import React, { useState, useRef, useEffect } from "react"
import { Box, Text, Spacer, Newline } from "ink"
import { Spinner } from "./Spinner"
import TextInput from "ink-text-input"

export const ChatView: React.FC<ChatViewProps> = ({ controller, state }) => {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const handleSubmit = async (value: string) => {
    if (!value.trim()) return
    
    setInput("")
    setIsLoading(true)
    
    await controller.initTask(value)
    
    setIsLoading(false)
  }
  
  return (
    <Box flexDirection="column" height="100%" padding={1}>
      <Box flexDirection="column" flexGrow={1}>
        {state.messages.map((message, index) => (
          <MessageRow key={message.id} message={message} />
        ))}
        {isLoading && <Spinner text="Thinking..." />}
      </Box>
      
      <Box borderStyle="single" marginTop={1}>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Ask me anything... (press Enter to send)"
        />
      </Box>
    </Box>
  )
}

// Message row component
const MessageRow: React.FC<{ message: ClineMessage }> = ({ message }) => {
  const isUser = message.role === "user"
  
  return (
    <Box marginBottom={1}>
      <Box marginRight={1}>
        <Text color={isUser ? "green" : "cyan"}>
          {isUser ? "You:" : "Cline:"}
        </Text>
      </Box>
      <Box flexWrap="wrap">
        <Text color={isUser ? "white" : "gray"}>
          {renderMessageContent(message)}
        </Text>
      </Box>
    </Box>
  )
}
```

### Model Picker

```tsx
// cli/src/components/ModelPicker.tsx
import React, { useState } from "react"
import { Box, Text } from "ink"
import SelectInput from "ink-select-input"
import { getModelsForProvider } from "../utils/models"
import { COLORS } from "../constants/colors"

export const ModelPicker: React.FC<ModelPickerProps> = ({ 
  provider, 
  selectedModelId, 
  onSelect 
}) => {
  const models = getModelsForProvider(provider)
  const items = models.map(model => ({
    label: `${model.name} (${model.contextWindow.toLocaleString()} tokens)`,
    value: model.id
  }))
  
  return (
    <Box flexDirection="column">
      <Text color={COLORS.primaryBlue}>Select Model:</Text>
      <SelectInput
        items={items}
        onSelect={(item) => onSelect(item.value)}
        initialIndex={models.findIndex(m => m.id === selectedModelId)}
      />
    </Box>
  )
}
```

## State Management (CLI-specific)

```typescript
// cli/src/hooks/useExtensionState.ts
import { useEffect, useState } from "react"
import type { Controller } from "@/core/controller"

export function useExtensionState(controller: Controller) {
  const [state, setState] = useState(controller.getStateToPostToWebview())
  
  useEffect(() => {
    // Poll for state changes (simpler than event system for CLI)
    const interval = setInterval(() => {
      const newState = controller.getStateToPostToWebview()
      setState(newState)
    }, 100)
    
    return () => clearInterval(interval)
  }, [controller])
  
  const sendMessage = async (action: WebviewAction) => {
    switch (action.type) {
      case "initTask":
        await controller.initTask(action.task)
        break
      case "clearTask":
        await controller.clearTask()
        break
      // ... other actions
    }
  }
  
  return { state, sendMessage }
}
```

## Color Handling

```typescript
// cli/src/constants/colors.ts
export const COLORS = {
  primaryBlue: "#0078D4",     // Highlight color for selections, spinners, success
  success: "#00CC00",
  error: "#FF4444",
  warning: "#FFAA00",
  info: "#00AAFF"
}

// Usage in components
import { COLORS } from "../constants/colors"

<Text color={COLORS.primaryBlue}>Selected</Text>
```

## Integration with Core Extension

```typescript
// cli/src/utils/initialize.ts
import { createStorageContext } from "@/shared/storage/storage-context"
import { StateManager } from "@/core/storage/StateManager"
import { Controller } from "@/core/controller"
import { HostProvider } from "@/hosts/host-provider"
import { CliHostProvider } from "../hosts/CliHostProvider"

export async function initializeCore(options: CliOptions) {
  // 1. Set up CLI host provider
  const hostProvider = new CliHostProvider(options)
  HostProvider.setInstance(hostProvider)
  
  // 2. Create storage context (file-based, same as VS Code)
  const storageContext = createStorageContext({
    workspacePath: options.workspacePath
  })
  
  // 3. Initialize StateManager
  await StateManager.initialize(storageContext)
  
  // 4. Create controller
  const context = {
    extensionPath: process.cwd(),
    subscriptions: [],
    // ... minimal extension context for CLI
  }
  const controller = new Controller(context as any)
  
  // 5. Initialize MCP hub
  await controller.mcpHub.initialize()
  
  return { controller, storageContext }
}
```

## Build and Package

### Build Script

```json
// cli/package.json
{
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/cli.js",
    "prepack": "npm run build",
    "test": "vitest"
  },
  "bin": {
    "cline": "./dist/cli.js"
  }
}
```

### Installation

```bash
# From npm
npm install -g @cline/cli

# From source
cd cli
npm run build
npm link

# Run
cline "Create a React component"
```

## Provider Configuration for CLI

```typescript
// cli/src/utils/provider-config.ts
import { Controller } from "@/core/controller"

export async function applyProviderConfig({
  providerId,
  controller
}: {
  providerId: string
  controller: Controller
}) {
  // Set provider and default model
  const stateManager = controller.stateManager
  const apiConfig = stateManager.getApiConfiguration()
  
  // Get provider details from shared config
  const { defaultModelId, models } = await import(`@/shared/api/providers/${providerId}`)
  
  // Update configuration
  await stateManager.setApiConfiguration({
    ...apiConfig,
    apiProvider: providerId as any,
    modelId: defaultModelId
  })
  
  // Handle API key mapping if needed
  const apiKey = await stateManager.getSecretKey(`${providerId}ApiKey`)
  if (apiKey) {
    await stateManager.setSecret("apiKey", apiKey)
  }
  
  // Rebuild API handler
  await controller.rebuildApiHandler()
}
```

## Testing CLI

```typescript
// cli/vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"]
  }
})

// cli/src/__tests__/cli.test.ts
import { describe, it, expect } from "vitest"
import { parseCliOptions } from "../utils/options"

describe("CLI Options Parser", () => {
  it("parses provider option", () => {
    const options = parseCliOptions({
      provider: "anthropic",
      model: "claude-3-opus"
    })
    
    expect(options.apiProvider).toBe("anthropic")
    expect(options.model).toBe("claude-3-opus")
  })
})
```

## Performance Considerations

### React Ink Optimization

```tsx
// Use memo for expensive components
const MessageRow = React.memo(({ message }) => {
  // Component logic
})

// Avoid unnecessary re-renders
const chatViewState = useMemo(() => ({
  messages: state.messages,
  isLoading
}), [state.messages, isLoading])
```

### Terminal Responsiveness

- Debounced state polling (100ms interval)
- Virtual scrolling for large message lists
- Lazy loading of settings panels

## Troubleshooting

### Common Issues

1. **Colors not displaying**
   - Check terminal supports truecolor
   - Use `NO_COLOR=1` environment variable to disable

2. **Slow performance**
   - Reduce state polling interval
   - Increase terminal buffer size

3. **API key not found**
   - Check `~/.cline/data/secrets.json` exists
   - Verify file permissions

## Related Files

- `cli/src/index.ts` - CLI entry point
- `cli/src/components/App.tsx` - Main TUI component
- `cli/src/hooks/useExtensionState.ts` - State management
- `cli/src/utils/initialize.ts` - Core initialization
- `cli/src/constants/colors.ts` - Color constants
- `src/hosts/cli/` - CLI host provider implementation