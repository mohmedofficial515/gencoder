# Webview UI Architecture Documentation

## Overview

Cline's user interface is built as a React application running in a VS Code webview. The webview communicates with the extension backend via message passing and gRPC-like protocol over protobuf.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              WebviewProvider (Host)                   │   │
│  │         (Creates and manages webview)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                      postMessage/RPC                         │
│                              ▼                               │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Webview UI (React)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           ExtensionStateContext (State)               │   │
│  │         (Provides state to all components)            │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│              ┌───────────────┼───────────────┐              │
│              ▼               ▼               ▼              │
│         Chat View      Settings View    History View        │
│         Components      Components       Components         │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
webview-ui/
├── src/
│   ├── App.tsx                    # Main app component
│   ├── main.tsx                   # Entry point
│   ├── context/
│   │   └── ExtensionStateContext.tsx  # Global state provider
│   ├── components/
│   │   ├── chat/                  # Chat UI components
│   │   │   ├── ChatRow.tsx        # Individual message row
│   │   │   ├── ChatTextArea.tsx   # Input area
│   │   │   └── MessageContent.tsx # Message rendering
│   │   ├── settings/              # Settings panels
│   │   │   ├── ApiOptions.tsx     # API configuration
│   │   │   ├── ModelPicker.tsx    # Model selection
│   │   │   └── SettingsPanel.tsx  # Main settings view
│   │   ├── history/               # Task history
│   │   ├── mcp/                   # MCP server management
│   │   └── common/                # Shared components
│   ├── hooks/                     # Custom React hooks
│   ├── utils/                     # Utility functions
│   ├── styles/                    # CSS/Tailwind styles
│   └── types/                     # TypeScript definitions
├── index.html                     # HTML entry point
├── vite.config.ts                 # Vite configuration
├── tailwind.config.mjs            # Tailwind CSS config
└── package.json                   # Dependencies
```

## State Management

### ExtensionStateContext

The single source of truth for webview state:

```typescript
// webview-ui/src/context/ExtensionStateContext.tsx

interface ExtensionState {
  // Extension info
  version: string
  platform: "vscode" | "cli" | "jetbrains"
  
  // Chat state
  messages: ClineMessage[]
  taskHistory: HistoryItem[]
  currentTaskId?: string
  
  // Configuration
  apiConfiguration: ApiConfiguration
  autoApprovalSettings: AutoApprovalSettings
  settings: Settings
  
  // Theme
  theme: "light" | "dark" | "high-contrast"
  
  // MCP
  mcpServers: McpServer[]
  mcpMarketplaceCatalog: McpMarketplaceCatalog
  
  // UI state
  showSettings: boolean
  showHistory: boolean
  activeTab: "chat" | "settings" | "history" | "mcp"
  
  // Workspace
  workspacePaths: string[]
  filePaths: string[]
  
  // Features
  featureFlags: Record<string, boolean>
}

// Context provider
export const ExtensionStateContextProvider: React.FC = ({ children }) => {
  const [state, setState] = useState<ExtensionState>(initialState)
  
  // Listen for messages from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data
      switch (message.type) {
        case "state":
          setState(message.state)
          break
        case "partialMessage":
          updatePartialMessage(message.content)
          break
        case "theme":
          setTheme(message.theme)
          break
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])
  
  // Send actions to extension
  const sendMessage = useCallback((action: WebviewAction) => {
    vscode.postMessage(action)
  }, [])
  
  return (
    <ExtensionStateContext.Provider value={{ state, sendMessage }}>
      {children}
    </ExtensionStateContext.Provider>
  )
}

// Custom hook for accessing state
export const useExtensionState = () => {
  const context = useContext(ExtensionStateContext)
  if (!context) {
    throw new Error("useExtensionState must be used within ExtensionStateContextProvider")
  }
  return context
}
```

## Communication Pattern

### Webview to Extension

```typescript
// Send action from webview
const vscode = acquireVsCodeApi()

vscode.postMessage({
  type: "action",
  action: "chatButtonClicked",
  payload: { message: userInput }
})

// Extension receives via WebviewProvider
class WebviewProvider {
  private handleMessage(message: WebviewMessage) {
    switch (message.action) {
      case "chatButtonClicked":
        this.controller.initTask(message.payload.message)
        break
    }
  }
}
```

### Extension to Webview

```typescript
// Send state from extension
await this.postStateToWebview()

// Implementation in Controller
async postStateToWebview() {
  const state = await this.getStateToPostToWebview()
  this.webview.postMessage({
    type: "state",
    state
  })
}
```

## gRPC/Protobuf Communication

Cline uses a gRPC-like protocol for type-safe communication:

### Proto Definitions

```protobuf
// proto/cline/ui.proto
service UiService {
  rpc scrollToSettings(StringRequest) returns (KeyValuePair);
  rpc subscribeToState(Empty) returns (stream ExtensionState);
  rpc sendChatMessage(ChatMessageRequest) returns (Empty);
}

message ChatMessageRequest {
  string message = 1;
  repeated string images = 2;
  repeated string files = 3;
}
```

### Generated Client

```typescript
// webview-ui/src/services/grpc/index.ts
import { UiServiceClient } from "../../../src/generated/grpc-js/ui_grpc_pb"

// Use generated client
await UiServiceClient.scrollToSettings(
  StringRequest.create({ value: "browser" })
)
```

## Component Structure

### Chat View

```tsx
// webview-ui/src/components/chat/ChatView.tsx
export const ChatView: React.FC = () => {
  const { state, sendMessage } = useExtensionState()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [state.messages])
  
  return (
    <div className="chat-container">
      <div className="messages">
        {state.messages.map((message, index) => (
          <ChatRow
            key={message.id}
            message={message}
            isLast={index === state.messages.length - 1}
            lastModifiedMessage={state.messages[state.messages.length - 1]}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <ChatTextArea onSend={(text) => sendMessage({ type: "send", text })} />
    </div>
  )
}
```

### Chat Row

```tsx
// webview-ui/src/components/chat/ChatRow.tsx
export const ChatRow: React.FC<ChatRowProps> = ({ message, isLast, lastModifiedMessage }) => {
  // Handle cancelled/interrupted states
  const wasCancelled = useMemo(() => {
    if (message.type === "say" && message.say === "generate_explanation") {
      const explanationInfo = JSON.parse(message.text || "{}")
      return (
        explanationInfo.status === "generating" &&
        (!isLast || lastModifiedMessage?.ask === "resume_task" || 
         lastModifiedMessage?.ask === "resume_completed_task")
      )
    }
    return false
  }, [message, isLast, lastModifiedMessage])
  
  const isGenerating = message.type === "say" && 
                       message.say === "generate_explanation" && 
                       !wasCancelled
  
  return (
    <div className={`chat-row ${message.role}`}>
      <div className="avatar">
        {message.role === "user" ? <UserIcon /> : <ClineIcon />}
      </div>
      <div className="content">
        {isGenerating ? <Spinner /> : renderMessageContent(message)}
      </div>
    </div>
  )
}
```

## Settings Components

### API Options

```tsx
// webview-ui/src/components/settings/ApiOptions.tsx
export const ApiOptions: React.FC = () => {
  const { state, sendMessage } = useExtensionState()
  const { apiConfiguration } = state
  
  const handleProviderChange = (provider: ApiProvider) => {
    sendMessage({
      type: "updateSetting",
      key: "apiProvider",
      value: provider
    })
  }
  
  const handleModelChange = (modelId: string) => {
    sendMessage({
      type: "updateSetting",
      key: "modelId",
      value: modelId
    })
  }
  
  switch (apiConfiguration.apiProvider) {
    case "anthropic":
      return <AnthropicOptions config={apiConfiguration} onChange={handleChange} />
    case "openrouter":
      return <OpenRouterOptions config={apiConfiguration} onChange={handleChange} />
    // ... other providers
    default:
      return <DefaultOptions config={apiConfiguration} onChange={handleChange} />
  }
}
```

### Model Picker

```tsx
// webview-ui/src/components/settings/ModelPicker.tsx
export const ModelPicker: React.FC<ModelPickerProps> = ({ 
  provider, 
  selectedModelId, 
  onSelect 
}) => {
  const models = getModelsForProvider(provider)
  
  return (
    <select value={selectedModelId} onChange={(e) => onSelect(e.target.value)}>
      {models.map(model => (
        <option key={model.id} value={model.id}>
          {model.name} ({model.contextWindow.toLocaleString()} tokens)
        </option>
      ))}
    </select>
  )
}
```

## Styling

### Tailwind CSS Configuration

```js
// tailwind.config.mjs
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          700: '#1d4ed8',
        }
      }
    }
  }
}
```

### Theme Support

```tsx
// App.tsx
const App: React.FC = () => {
  const { state } = useExtensionState()
  
  useEffect(() => {
    document.body.className = state.theme
  }, [state.theme])
  
  return (
    <div className={`app ${state.theme}`}>
      {/* App content */}
    </div>
  )
}
```

## Performance Optimizations

### Virtual Scrolling

For large message histories:

```tsx
import { Virtuoso } from 'react-virtuoso'

export const MessageList: React.FC = () => {
  const { state } = useExtensionState()
  
  return (
    <Virtuoso
      data={state.messages}
      itemContent={(index, message) => (
        <ChatRow key={message.id} message={message} />
      )}
    />
  )
}
```

### Memoization

```tsx
export const ChatRow = React.memo<ChatRowProps>(({ message, isLast }) => {
  // Component logic
}, (prevProps, nextProps) => {
  return prevProps.message.id === nextProps.message.id &&
         prevProps.isLast === nextProps.isLast
})
```

### Lazy Loading

```tsx
const SettingsPanel = React.lazy(() => import('./components/settings/SettingsPanel'))

// In App
<Suspense fallback={<LoadingSpinner />}>
  <SettingsPanel />
</Suspense>
```

## Error Handling

### Error Boundary

```tsx
// webview-ui/src/components/common/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Send error to extension for logging
    vscode.postMessage({
      type: "error",
      error: error.message,
      stack: error.stack
    })
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorMessage error={this.state.error} />
    }
    return this.props.children
  }
}
```

## Building and Development

### Development Server

```bash
cd webview-ui
npm run dev  # Starts Vite dev server with HMR
```

### Production Build

```bash
npm run build  # Builds to dist/ directory
```

### Integration with Extension

The extension loads the webview from:

```typescript
// For development: localhost
const webviewHtml = IS_DEV 
  ? "http://localhost:5173" 
  : getWebviewHtmlFromDist()
```

## Testing

### Unit Tests

```tsx
// webview-ui/src/components/chat/ChatRow.test.tsx
import { render, screen } from '@testing-library/react'
import { ChatRow } from './ChatRow'

test('renders user message', () => {
  const message = {
    id: "1",
    role: "user",
    text: "Hello world"
  }
  
  render(<ChatRow message={message} isLast={true} />)
  
  expect(screen.getByText("Hello world")).toBeInTheDocument()
})
```

## Related Files

- `webview-ui/src/App.tsx` - Main app component
- `webview-ui/src/context/ExtensionStateContext.tsx` - State management
- `webview-ui/src/components/chat/ChatRow.tsx` - Message rendering
- `webview-ui/src/components/settings/ApiOptions.tsx` - API configuration
- `webview-ui/vite.config.ts` - Build configuration
- `src/core/webview/index.ts` - Webview provider (extension side)