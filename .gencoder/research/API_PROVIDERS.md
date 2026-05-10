# API Provider System Documentation

## Overview

Cline supports multiple AI providers through a modular API provider system. Each provider is implemented as a separate module that follows a common interface, allowing easy addition of new providers.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    API Factory                           │
│            createHandlerForProvider()                    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                API Handler Interface                     │
│              (src/api/handler.ts)                        │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Anthropic   │  │  OpenRouter  │  │   Bedrock    │
│   Handler    │  │   Handler    │  │   Handler    │
└──────────────┘  └──────────────┘  └──────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Gemini     │  │   Cerebras   │  │    Ollama    │
│   Handler    │  │   Handler    │  │   Handler    │
└──────────────┘  └──────────────┘  └──────────────┘
```

## Supported Providers

| Provider | Type | API Format | Notes |
|----------|------|------------|-------|
| Anthropic | Cloud | Message API | Claude models |
| OpenRouter | Meta | Chat Completion | Multi-model support |
| AWS Bedrock | Cloud | Bedrock API | Claude, Llama, etc. |
| Gemini | Cloud | Generative AI | Google models |
| Cerebras | Cloud | Chat Completion | Llama, Qwen, DeepSeek |
| Ollama | Local | Chat Completion | Self-hosted |
| LM Studio | Local | Chat Completion | Self-hosted |
| VSCode LM | Built-in | LM API | VS Code's language models |
| OpenAI Codex | Cloud | Responses API | Code-specific models |
| DeepSeek | Cloud | Chat Completion | DeepSeek models |

## Provider Handler Interface

All providers implement the same interface:

```typescript
interface ApiHandler {
  // Create a streaming request
  createMessage(
    systemPrompt: string,
    messages: ApiMessage[],
    tools: Tool[]
  ): AsyncGenerator<ApiStreamChunk>
  
  // Get model information
  getModel(): ModelInfo
  
  // Get API configuration
  getApiConfiguration(): ApiConfiguration
  
  // Optional: Handle authentication
  authenticate?(): Promise<void>
}
```

## Adding a New Provider

### Step 1: Update Protobuf Definitions

In `proto/cline/models.proto`:

```protobuf
enum ApiProvider {
  // ... existing providers
  MY_NEW_PROVIDER = 40;  // Use next available number
}
```

### Step 2: Add Proto Conversion Mappings

In `src/shared/proto-conversions/models/api-configuration-conversion.ts`:

```typescript
// Convert API provider string to proto enum
export function convertApiProviderToProto(provider: ApiProvider): ApiProviderEnum {
  switch (provider) {
    // ... existing cases
    case "my-new-provider":
      return ApiProviderEnum.MY_NEW_PROVIDER
    default:
      return ApiProviderEnum.ANTHROPIC
  }
}

// Convert proto enum to API provider string
export function convertProtoToApiProvider(provider: ApiProviderEnum): ApiProvider {
  switch (provider) {
    // ... existing cases
    case ApiProviderEnum.MY_NEW_PROVIDER:
      return "my-new-provider"
    default:
      return "anthropic"
  }
}
```

⚠️ **CRITICAL**: Without these mappings, the provider will silently reset to Anthropic when state round-trips through protobuf serialization.

### Step 3: Add Type Definitions

In `src/shared/api.ts`:

```typescript
// Add to ApiProvider union type
export type ApiProvider = 
  | "anthropic"
  | "openrouter"
  // ...
  | "my-new-provider"

// Define models for the provider
export const myNewProviderModels: ModelInfo[] = [
  {
    id: "model-id",
    name: "Model Name",
    maxTokens: 4096,
    contextWindow: 128000,
    supportsImages: true,
    supportsToolUse: true,
    apiFormat: ApiFormat.CHAT_COMPLETION, // or OPENAI_RESPONSES
  },
]

export const myNewProviderDefaultModelId = "model-id"
```

### Step 4: Create Handler Implementation

Create `src/api/providers/my-new-provider.ts`:

```typescript
import { ApiHandler } from "../handler"
import type { ApiConfiguration, ModelInfo } from "@/shared/api"
import type { ApiStream } from "../transform/stream"

export class MyNewProviderHandler implements ApiHandler {
  private client: any
  
  constructor(private config: ApiConfiguration) {
    // Initialize client with proxy-aware fetch
    import { fetch } from "@/shared/net"
    this.client = new SomeSDK({
      apiKey: config.apiKey,
      fetch, // CRITICAL: Use our fetch wrapper for proxy support
    })
  }
  
  async *createMessage(
    systemPrompt: string,
    messages: ApiMessage[],
    tools: Tool[]
  ): ApiStream {
    // 1. Transform messages to provider format
    const formattedMessages = this.formatMessages(messages)
    
    // 2. Make API request
    const response = await this.client.chat.completions.create({
      model: this.getModel().id,
      messages: [
        { role: "system", content: systemPrompt },
        ...formattedMessages,
      ],
      tools: tools.length > 0 ? this.formatTools(tools) : undefined,
      stream: true,
    })
    
    // 3. Stream response chunks
    for await (const chunk of response) {
      yield this.transformChunk(chunk)
    }
  }
  
  getModel(): ModelInfo {
    // Return model info for current configuration
    return myNewProviderModels.find(m => m.id === this.config.modelId)!
  }
  
  getApiConfiguration(): ApiConfiguration {
    return this.config
  }
  
  private formatMessages(messages: ApiMessage[]): any[] {
    // Provider-specific formatting
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }))
  }
  
  private formatTools(tools: Tool[]): any[] {
    // Provider-specific tool formatting
    return tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }
  
  private transformChunk(chunk: any): ApiStreamChunk {
    // Convert provider chunk format to common format
    if (chunk.choices[0]?.delta?.content) {
      return {
        type: "text",
        text: chunk.choices[0].delta.content,
      }
    }
    if (chunk.choices[0]?.delta?.tool_calls) {
      return {
        type: "tool_use",
        toolCall: chunk.choices[0].delta.tool_calls[0],
      }
    }
    return { type: "done", usage: chunk.usage }
  }
}
```

### Step 5: Register Handler

In `src/core/api/index.ts`:

```typescript
export function createHandlerForProvider(
  provider: ApiProvider,
  config: ApiConfiguration
): ApiHandler {
  switch (provider) {
    case "anthropic":
      return new AnthropicHandler(config)
    case "openrouter":
      return new OpenRouterHandler(config)
    // ... existing cases
    case "my-new-provider":
      return new MyNewProviderHandler(config)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
```

### Step 6: Add to Provider List (Webview)

In `webview-ui/src/components/settings/utils/providerUtils.ts`:

```typescript
export function getModelsForProvider(provider: ApiProvider): ModelInfo[] {
  switch (provider) {
    // ... existing cases
    case "my-new-provider":
      return myNewProviderModels
    default:
      return []
  }
}

export function normalizeApiConfiguration(config: ApiConfiguration): ApiConfiguration {
  // Add any provider-specific normalization
  if (config.apiProvider === "my-new-provider" && !config.modelId) {
    config.modelId = myNewProviderDefaultModelId
  }
  return config
}
```

### Step 7: Add Validation

In `webview-ui/src/utils/validate.ts`:

```typescript
export function validateApiConfiguration(config: ApiConfiguration): ValidationResult {
  switch (config.apiProvider) {
    // ... existing cases
    case "my-new-provider":
      if (!config.apiKey) {
        return { valid: false, error: "API key is required" }
      }
      if (!config.modelId) {
        return { valid: false, error: "Model is required" }
      }
      return { valid: true }
    default:
      return { valid: false, error: "Unknown provider" }
  }
}
```

### Step 8: Add UI Component (Optional)

For complex auth flows, add a provider component in `webview-ui/src/components/settings/ApiOptions.tsx`:

```tsx
case "my-new-provider":
  return (
    <MyNewProviderOptions
      apiConfiguration={apiConfiguration}
      setApiConfigurationField={setApiConfigurationField}
    />
  )
```

## Responses API Providers (OpenAI Codex, OpenAI Native)

Providers using OpenAI's Responses API require **native tool calling**. XML tools don't work with the Responses API.

### Critical Configuration

1. **Add to `isNextGenModelProvider()`** in `src/utils/model-utils.ts`:

```typescript
export function isNextGenModelProvider(provider: ApiProvider): boolean {
  return [
    "openai-codex",
    "openai-native",
    "my-responses-provider", // Add your provider here
  ].includes(provider)
}
```

2. **Set `apiFormat: ApiFormat.OPENAI_RESPONSES`** on all models:

```typescript
export const myProviderModels: ModelInfo[] = [
  {
    id: "model-id",
    name: "Model Name",
    apiFormat: ApiFormat.OPENAI_RESPONSES, // CRITICAL
    // ... other properties
  },
]
```

### Why This Matters

Without these settings:
- The variant matcher falls back to XML tools
- Tools get called multiple times or arguments get duplicated
- The model may not recognize tool calls at all

## Provider Configuration Storage

API configurations are stored securely:

```typescript
// In StateManager
const apiConfiguration = stateManager.getGlobalStateKey("apiConfiguration")

// Structure
interface ApiConfiguration {
  apiProvider: ApiProvider
  modelId: string
  apiKey?: string      // Stored in secrets
  baseUrl?: string
  customHeaders?: Record<string, string>
  temperature?: number
  maxTokens?: number
  
  // Plan/Act mode separate configs
  planModeApiProvider?: ApiProvider
  actModeApiProvider?: ApiProvider
  planModeModelId?: string
  actModeModelId?: string
}
```

## Plan/Act Mode Configuration

Cline supports different models for Plan and Act modes:

```typescript
// Switching modes preserves model selections
await controller.togglePlanActModeWithChatSettings()

// UI displays different model pickers per mode
const currentMode = stateManager.getGlobalStateKey("chatSettings")?.mode
const modelId = currentMode === "plan" 
  ? apiConfiguration.planModeModelId 
  : apiConfiguration.actModeModelId
```

## Error Handling

Providers should implement retry logic:

```typescript
async *createMessage(...) {
  let retries = 0
  while (retries < 3) {
    try {
      return yield* this.makeRequest(...)
    } catch (error) {
      if (this.isRetryableError(error) && retries < 2) {
        await delay(1000 * Math.pow(2, retries))
        retries++
        continue
      }
      throw error
    }
  }
}
```

## Testing Providers

```typescript
// Unit test for provider
import { MyNewProviderHandler } from "@/api/providers/my-new-provider"

describe("MyNewProviderHandler", () => {
  it("should stream responses correctly", async () => {
    const handler = new MyNewProviderHandler(mockConfig)
    const stream = handler.createMessage("test", [], [])
    
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    
    expect(chunks.some(c => c.type === "text")).toBe(true)
  })
})
```

## Common Issues

### Provider Resets to Anthropic

**Symptom:** Provider selection doesn't persist after saving

**Cause:** Missing proto conversion mappings

**Fix:** Update both `convertApiProviderToProto` and `convertProtoToApiProvider`

### Native Tools Not Working

**Symptom:** Tools are called multiple times or arguments malformed

**Cause:** Provider not in `isNextGenModelProvider()` or missing `apiFormat`

**Fix:** Add provider to the list and set `apiFormat: ApiFormat.OPENAI_RESPONSES`

### Proxy Not Working

**Symptom:** API requests fail in corporate environment

**Cause:** Not using proxy-aware fetch wrapper

**Fix:** Always pass `{ fetch }` from `@/shared/net` to SDK client

## Related Files

- `src/api/handler.ts` - Handler interface
- `src/api/providers/` - Provider implementations
- `src/api/transform/` - Stream transformers
- `src/core/api/index.ts` - Handler factory
- `src/shared/api.ts` - Type definitions
- `proto/cline/models.proto` - Proto definitions
- `webview-ui/src/components/settings/ApiOptions.tsx` - UI components