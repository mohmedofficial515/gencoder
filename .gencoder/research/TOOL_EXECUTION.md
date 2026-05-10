# Tool Execution System Documentation

## Overview

Cline provides a rich set of tools that allow the AI to interact with the user's environment. Tools are executed with user approval (unless auto-approved) and can modify files, run commands, browse the web, and more.

## Tool Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Task Execution                          │
│            (parses assistant message for tools)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tool Executor                             │
│         (routes tool calls to appropriate handlers)          │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ File Tools   │      │  Terminal    │      │   Browser    │
│ (read/write) │      │   Tools      │      │   Tools      │
└──────────────┘      └──────────────┘      └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   MCP Tools  │      │   Search     │      │   System     │
│  (external)  │      │   Tools      │      │   Tools      │
└──────────────┘      └──────────────┘      └──────────────┘
```

## Available Tools

| Tool | Description | Auto-approval | Handler |
|------|-------------|---------------|---------|
| `read_file` | Read file contents | Yes | FileHandler |
| `write_to_file` | Create/overwrite file | No | FileHandler |
| `replace_in_file` | Make targeted edits | No | FileHandler |
| `execute_command` | Run CLI commands | Configurable | CommandHandler |
| `search_files` | Regex search in files | Yes | SearchHandler |
| `list_files` | List directory contents | Yes | ListHandler |
| `list_code_definition_names` | List code definitions | Yes | CodeDefinitionHandler |
| `ask_followup_question` | Ask user a question | Yes | QuestionHandler |
| `attempt_completion` | Complete the task | No | CompletionHandler |
| `use_mcp_tool` | Call MCP server tool | Configurable | McpToolHandler |
| `access_mcp_resource` | Read MCP resource | Yes | McpResourceHandler |
| `load_mcp_documentation` | Load MCP docs | Yes | McpDocHandler |
| `use_skill` | Activate a skill | Yes | SkillHandler |
| `generate_explanation` | Generate diff explanation | Yes | ExplainHandler |
| `plan_mode_respond` | Respond in plan mode | Yes | PlanModeHandler |

## Tool Execution Flow

### 1. Tool Detection and Parsing

```typescript
// In Task class
async presentAssistantMessage() {
  // Parse streaming content for tool_use blocks
  for (const block of assistantMessageContent) {
    if (block.type === "tool_use") {
      // Execute tool with approval flow
      await this.executeToolWithApproval(block)
    }
  }
}
```

### 2. Approval Flow

```typescript
async executeToolWithApproval(block: ToolBlock) {
  // Check auto-approval settings
  const shouldAutoApprove = this.shouldAutoApproveTool(block.name)
  
  if (shouldAutoApprove) {
    // Execute without asking
    await this.say("tool", message)
    this.consecutiveAutoApprovedRequestsCount++
  } else {
    // Request user approval
    const didApprove = await askApproval("tool", message)
    if (!didApprove) {
      this.didRejectTool = true
      return
    }
  }
  
  // Execute the tool
  const result = await this.executeTool(block)
  
  // Save checkpoint after each tool execution
  await this.saveCheckpoint()
  
  // Return result to API
  return result
}
```

### 3. Tool Handler Pattern

Each tool implements a standard handler:

```typescript
interface ToolHandler {
  // Check if tool is allowed in current context
  isAllowed(): boolean
  
  // Execute the tool with given parameters
  execute(params: any): Promise<ToolResult>
  
  // Get user-facing description (for approval UI)
  getDescription(params: any): string
  
  // Check if tool can be auto-approved
  canAutoApprove(params: any): boolean
}
```

## File Tools

### read_file

```typescript
// Parameters
{
  path: string           // File path relative to workspace
  start_line?: number    // Start line (1-based)
  end_line?: number      // End line (inclusive)
}

// Returns
{
  content: string        // File content with line numbers
  totalLines: number     // Total lines in file
}
```

**Auto-approval:** Yes (read-only)

### write_to_file

```typescript
// Parameters
{
  path: string           // File path to write
  content: string        // Complete file content
}

// Returns
{
  success: boolean
  message: string
}
```

**Auto-approval:** No (modifies files)

### replace_in_file

```typescript
// Parameters
{
  path: string           // File path to modify
  diff: string           // SEARCH/REPLACE blocks
}

// Returns
{
  success: boolean
  message: string
  matches: number        // Number of replacements made
}
```

**Auto-approval:** No (modifies files)

## Terminal Tools

### execute_command

```typescript
// Parameters
{
  command: string        // CLI command to run
  requires_approval: boolean  // Whether user approval needed
  cwd?: string          // Working directory (optional)
}

// Returns
{
  exitCode: number
  stdout: string
  stderr: string
  completed: boolean     // Whether command finished
}
```

**Auto-approval:** Configurable per command pattern

**Terminal Management:**

```typescript
class TerminalManager {
  // Get or create terminal for working directory
  async getOrCreateTerminal(cwd: string): Promise<TerminalInfo>
  
  // Run command with output streaming
  async runCommand(terminal: TerminalInfo, command: string): Promise<Process>
  
  // List active terminals
  listTerminals(): TerminalInfo[]
  
  // Kill terminal process
  killTerminal(terminalId: string): Promise<void>
}
```

## Browser Tools

Browser automation via Puppeteer:

```typescript
class BrowserSession {
  // Launch browser with fixed 900x600 resolution
  async launchBrowser(): Promise<void>
  
  // Navigate to URL
  async navigateToUrl(url: string): Promise<NavigationResult>
  
  // Click at coordinates
  async click(coordinate: {x: number, y: number}): Promise<void>
  
  // Type text
  async type(text: string): Promise<void>
  
  // Take screenshot
  async screenshot(): Promise<string>  // Base64 encoded
  
  // Get console logs
  getConsoleLogs(): string[]
  
  // Close browser
  async closeBrowser(): Promise<void>
}
```

## Search Tools

### search_files

```typescript
// Parameters
{
  path: string           // Directory to search
  regex: string          // Regex pattern (Rust syntax)
  file_pattern?: string  // Glob pattern (e.g., "*.ts")
}

// Returns
{
  matches: Array<{
    file: string         // File path
    line: number         // Line number
    content: string      // Matching line
    context: string[]    // Surrounding lines
  }>
}
```

## MCP Tools

Tools provided by external MCP servers:

```typescript
// In McpToolHandler
async execute(params: {
  server_name: string    // MCP server name
  tool_name: string      // Tool name on the server
  arguments: any         // Tool-specific arguments
}) {
  // Forward to MCP hub
  return await mcpHub.callTool(
    params.server_name,
    params.tool_name,
    params.arguments
  )
}
```

## Auto-Approval Configuration

Users can configure auto-approval for tools:

```typescript
interface AutoApprovalSettings {
  // Enable auto-approval globally
  enabled: boolean
  
  // Tools to always auto-approve
  allowedTools: string[]
  
  // Command patterns to auto-approve (regex)
  allowedCommandPatterns: string[]
  
  // Maximum consecutive auto-approved requests
  maxConsecutiveRequests: number
  
  // Reset counter after this many seconds
  resetTimerSeconds: number
}
```

## Checkpoint System

After each tool execution, Cline creates a Git checkpoint:

```typescript
async saveCheckpoint() {
  // Commit current state to Git
  const commitHash = await this.checkpointTracker.commit({
    message: `Tool execution: ${this.lastToolName}`,
    trackChanges: true
  })
  
  // Store checkpoint metadata
  await this.stateManager.setWorkspaceState("lastCheckpointHash", commitHash)
}
```

Checkpoints allow:
- Reverting to previous states
- Comparing changes between checkpoints
- Resuming interrupted tasks

## Tool Result Format

Tools return results in a standardized format:

```typescript
interface ToolResult {
  // Whether tool execution was successful
  success: boolean
  
  // Message for user/AI
  message: string
  
  // Additional data (tool-specific)
  data?: any
  
  // Whether to continue execution
  continue?: boolean
  
  // Error details (if any)
  error?: {
    code: string
    message: string
    details?: any
  }
}
```

## Error Handling

### Tool Execution Errors

```typescript
try {
  const result = await toolHandler.execute(params)
  if (!result.success) {
    throw new Error(result.message)
  }
  return result
} catch (error) {
  // Format error for API
  const errorResult = formatResponse.toolError(error.message)
  
  // Notify user
  await this.say("error", error.message)
  
  // Return error to API
  return errorResult
}
```

### Tool Timeout

```typescript
// Tools have timeout limits
const TIMEOUTS = {
  execute_command: 300000,  // 5 minutes
  write_to_file: 60000,     // 1 minute
  replace_in_file: 60000,   // 1 minute
  search_files: 30000,      // 30 seconds
  browser_action: 60000,    // 1 minute
}
```

## Adding a New Tool

### Step 1: Add to Tool Enum

In `src/shared/tools.ts`:

```typescript
export enum ClineDefaultTool {
  // ... existing tools
  MY_NEW_TOOL = "my_new_tool",
}
```

### Step 2: Create Tool Variants

In `src/core/prompts/system-prompt/tools/my_new_tool.ts`:

```typescript
import { ClineDefaultTool } from "@/shared/tools"
import { ModelFamily } from "../variants/types"

export const MY_NEW_TOOL_VARIANTS = [
  {
    family: ModelFamily.GENERIC,
    template: `
## my_new_tool
Description: Does something useful
Parameters:
- param1: (required) First parameter
- param2: (optional) Second parameter
Usage:
<my_new_tool>
<param1>value1</param1>
<param2>value2</param2>
</my_new_tool>
`,
  },
  // Add variants for other model families if needed
]
```

### Step 3: Register Tool

In `src/core/prompts/system-prompt/tools/init.ts`:

```typescript
import { MY_NEW_TOOL_VARIANTS } from "./my_new_tool"

export const allToolVariants = [
  // ... existing tools
  ...MY_NEW_TOOL_VARIANTS,
]
```

### Step 4: Add to Variant Configs

In each variant config (e.g., `variants/generic/config.ts`):

```typescript
tools() {
  return [
    ClineDefaultTool.READ_FILE,
    ClineDefaultTool.MY_NEW_TOOL,
    // ...
  ]
}
```

### Step 5: Create Handler

In `src/core/task/tools/handlers/MyNewToolHandler.ts`:

```typescript
import { ToolHandler } from "../ToolHandler"

export class MyNewToolHandler implements ToolHandler {
  isAllowed(): boolean {
    return true  // Or check permissions
  }
  
  canAutoApprove(params: any): boolean {
    // Determine if tool can auto-execute
    return params.safe === true
  }
  
  getDescription(params: any): string {
    return `Executing my_new_tool with param1=${params.param1}`
  }
  
  async execute(params: any): Promise<ToolResult> {
    try {
      // Validate parameters
      if (!params.param1) {
        throw new Error("param1 is required")
      }
      
      // Execute tool logic
      const result = await doSomething(params.param1, params.param2)
      
      return {
        success: true,
        message: `Tool executed successfully: ${result}`,
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message: `Tool execution failed: ${error.message}`,
        error: {
          code: "EXECUTION_FAILED",
          message: error.message,
        },
      }
    }
  }
}
```

### Step 6: Wire in ToolExecutor

In `src/core/task/ToolExecutor.ts`:

```typescript
case ClineDefaultTool.MY_NEW_TOOL:
  handler = new MyNewToolHandler()
  break
```

### Step 7: Add to Message Parsing (if needed)

In `src/core/assistant-message/index.ts`:

```typescript
// Add parser for XML format
if (tagName === "my_new_tool") {
  return {
    type: "tool_use",
    name: "my_new_tool",
    parameters: parseParameters(content),
  }
}
```

### Step 8: Add to Proto (for UI)

If tool has UI feedback:

1. Add to `ClineSay` enum in `proto/cline/ui.proto`
2. Update `src/shared/ExtensionMessage.ts`
3. Update `src/shared/proto-conversions/cline-message.ts`
4. Update `webview-ui/src/components/chat/ChatRow.tsx`

## Security Considerations

### Path Traversal Prevention

```typescript
function validatePath(filePath: string, workspaceRoot: string): boolean {
  const resolved = path.resolve(workspaceRoot, filePath)
  return resolved.startsWith(workspaceRoot)
}
```

### Command Injection Prevention

```typescript
// Use execFile instead of exec when possible
// Always escape arguments
function escapeCommandArg(arg: string): string {
  return arg.replace(/[&|;$<>`\\!]/g, "\\$&")
}
```

### Sensitive Information

Tools should never expose:
- API keys or tokens
- File system paths outside workspace
- Environment variables
- Personal information

## Performance

### Tool Execution Limits

- Max concurrent tools: 5
- Tool queue: Sequential execution
- Memory limit: 512MB per tool

### Caching

- File reads cached for 5 seconds
- Search results cached for 30 seconds
- Directory listings cached for 10 seconds

## Testing Tools

```typescript
// Unit test for tool handler
import { MyNewToolHandler } from "./MyNewToolHandler"

describe("MyNewToolHandler", () => {
  it("should execute successfully", async () => {
    const handler = new MyNewToolHandler()
    const result = await handler.execute({ param1: "test" })
    expect(result.success).toBe(true)
  })
  
  it("should handle errors", async () => {
    const handler = new MyNewToolHandler()
    const result = await handler.execute({})
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
```

## Related Files

- `src/core/task/index.ts` - Task execution and tool flow
- `src/core/task/ToolExecutor.ts` - Tool routing
- `src/core/task/tools/handlers/` - Tool implementations
- `src/core/prompts/system-prompt/tools/` - Tool definitions
- `src/shared/tools.ts` - Tool enums and types
- `src/hosts/vscode/terminal/` - Terminal management
- `src/services/browser/BrowserSession.ts` - Browser automation