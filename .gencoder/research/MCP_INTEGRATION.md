# MCP (Model Context Protocol) Integration Documentation

## Overview

Cline integrates with MCP servers to provide additional tools and resources beyond the built-in capabilities. MCP allows connecting to external servers that can expose custom functionality, databases, APIs, or any other data sources.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Controller                           │
│                      (manages McpHub)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                           McpHub                             │
│              (manages MCP server connections)                │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  MCP Server  │      │  MCP Server  │      │  MCP Server  │
│   (stdio)    │      │    (SSE)     │      │ (marketplace)│
└──────────────┘      └──────────────┘      └──────────────┘
```

## McpHub Class (`src/services/mcp/McpHub.ts`)

The central manager for all MCP server connections:

```typescript
class McpHub {
  // Connected servers
  private servers: Map<string, McpServer>
  
  // Server configurations
  private settings: McpSettings
  
  // Connection status
  private connecting: boolean
  
  constructor(
    private ensureMcpServersDirectoryExists: () => Promise<void>,
    private ensureSettingsDirectoryExists: () => Promise<void>,
    private extensionVersion: string,
    private telemetryService: TelemetryService
  )
  
  // Initialize connections from settings file
  async initialize(): Promise<void>
  
  // Connect to a specific server
  async connectToServer(serverName: string): Promise<void>
  
  // Disconnect from a server
  async disconnectFromServer(serverName: string): Promise<void>
  
  // Restart a server
  async restartServer(serverName: string): Promise<void>
  
  // Call a tool on a server
  async callTool(
    serverName: string,
    toolName: string,
    args: any
  ): Promise<ToolResult>
  
  // Access a resource
  async readResource(
    serverName: string,
    uri: string
  ): Promise<ResourceContents>
  
  // Get list of available tools from all servers
  getAllTools(): McpTool[]
  
  // Get list of available resources from all servers
  getAllResources(): McpResource[]
}
```

## MCP Server Types

### 1. Stdio Servers

Command-line based servers that communicate via standard input/output:

```json
{
  "mcpServers": {
    "my-stdio-server": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "API_KEY": "secret-key"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Features:**
- Simple to implement
- Works with any language
- Runs as a child process
- Good for local tools

### 2. SSE Servers (Server-Sent Events)

HTTP-based servers that communicate via SSE:

```json
{
  "mcpServers": {
    "my-sse-server": {
      "url": "http://localhost:3000/sse",
      "headers": {
        "Authorization": "Bearer token"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Features:**
- Remote server support
- Persistent connection
- Better for cloud services
- Supports authentication

## MCP Settings File

Location: `~/.cline/mcp_settings.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/dir"
      ],
      "disabled": false,
      "autoApprove": ["read_file", "list_directory"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      },
      "disabled": false,
      "autoApprove": []
    },
    "postgres": {
      "url": "http://localhost:3001/sse",
      "headers": {
        "Authorization": "Bearer token"
      },
      "disabled": false,
      "autoApprove": ["query"]
    }
  }
}
```

## Server Lifecycle

### Connection Process

```
1. McpHub.initialize()
   ↓
2. Read settings from mcp_settings.json
   ↓
3. For each enabled server:
   ↓
4. Spawn process (stdio) or connect HTTP (SSE)
   ↓
5. Negotiate capabilities (tools, resources, prompts)
   ↓
6. Register tools and resources
   ↓
7. Mark server as connected
```

### Health Monitoring

McpHub continuously monitors server health:

- **Stdio**: Process exit detection
- **SSE**: Heartbeat monitoring and reconnection
- Automatic restart on failure
- Exponential backoff for reconnection attempts

## Tool Integration

### Tool Discovery

MCP tools are automatically discovered and made available to Cline:

```typescript
// Tools exposed by MCP servers
interface McpTool {
  name: string           // e.g., "github_create_issue"
  description: string    // Tool description
  inputSchema: {
    type: "object",
    properties: Record<string, any>,
    required: string[]
  }
  serverName: string     // Which server provides this tool
}
```

### Tool Execution Flow

```
Task.executeTool()
   ↓
Check if tool is from MCP server
   ↓
Get server name from tool metadata
   ↓
McpHub.callTool(serverName, toolName, args)
   ↓
Send request to MCP server
   ↓
Wait for response
   ↓
Return result to Task
```

### Auto-Approval Settings

Users can configure auto-approval per tool:

```json
{
  "mcpServers": {
    "filesystem": {
      "autoApprove": ["read_file", "list_directory"]
    }
  }
}
```

Tools in `autoApprove` list execute without user confirmation.

## Resource Integration

MCP resources provide read-only data access:

```typescript
interface McpResource {
  uri: string            // e.g., "file:///path/to/file"
  name: string           // Human-readable name
  description?: string   // Optional description
  mimeType?: string      // e.g., "text/plain"
  serverName: string     // Providing server
}
```

### Accessing Resources

```typescript
// In Task execution
const content = await mcpHub.readResource(serverName, resourceUri)
```

## Marketplace System

Cline includes an MCP marketplace for easy server installation:

### Marketplace Catalog

Fetched from `https://api.cline.bot/v1/mcp/catalog`

```typescript
interface McpMarketplaceItem {
  id: string
  name: string
  description: string
  githubUrl: string
  author: string
  downloads: number
  tags: string[]
  configTemplate: {
    command?: string
    args?: string[]
    url?: string
    env?: Record<string, string>
  }
}
```

### Installation Flow

```typescript
// In Controller
async downloadMcp(mcpId: string) {
  // 1. Fetch server details
  const response = await axios.post(
    "https://api.cline.bot/v1/mcp/download",
    { mcpId }
  )
  
  // 2. Create task with context
  const task = `Set up the MCP server from ${mcpDetails.githubUrl}...`
  
  // 3. Initialize task
  await this.initClineWithTask(task)
}
```

## Adding MCP Server Support

### For Stdio Servers

1. **Add to settings**:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "my-command",
      "args": ["--arg1", "value1"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

2. **Implement MCP server** (any language):

```javascript
// server.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const server = new Server({
  name: "my-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
})

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "my_tool",
    description: "Does something",
    inputSchema: {
      type: "object",
      properties: {
        param1: { type: "string" }
      }
    }
  }]
}))

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "my_tool") {
    const result = await doSomething(request.params.arguments)
    return {
      content: [{ type: "text", text: result }]
    }
  }
})

// Start server
const transport = new StdioServerTransport()
await server.connect(transport)
```

### For SSE Servers

1. **Add to settings**:

```json
{
  "mcpServers": {
    "my-sse-server": {
      "url": "http://localhost:3000/sse",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

2. **Implement SSE server**:

```javascript
import express from "express"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"

const app = express()

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res)
  await server.connect(transport)
})

app.post("/messages", async (req, res) => {
  await transport.handlePostMessage(req, res)
})
```

## Error Handling

### Connection Failures

```typescript
try {
  await mcpHub.connectToServer(serverName)
} catch (error) {
  // Log error
  Logger.error(`Failed to connect to MCP server ${serverName}:`, error)
  
  // Mark server as failed
  server.status = "failed"
  server.error = error.message
  
  // Notify user
  HostProvider.window.showMessage({
    type: ShowMessageType.ERROR,
    message: `MCP server ${serverName} failed to connect`
  })
}
```

### Tool Call Failures

```typescript
try {
  const result = await mcpHub.callTool(serverName, toolName, args)
  return result
} catch (error) {
  return {
    isError: true,
    content: [{ type: "text", text: `Tool execution failed: ${error.message}` }]
  }
}
```

## Performance Considerations

### Connection Pool

- MCP servers share connection pool
- Max 10 concurrent connections per server
- Request timeout: 30 seconds (configurable)

### Caching

- Tool lists cached for 5 seconds
- Resource lists cached for 30 seconds
- Resource content not cached by default

### Memory Management

- Server processes terminated on extension deactivation
- Automatic cleanup of disconnected servers
- Resource limits: 100MB memory per server

## Security

### Process Isolation

- Stdio servers run as separate processes
- Restricted file system access via configured paths
- Environment variables isolated per server

### Authentication

- API keys stored in environment variables
- Headers support for SSE servers
- No credential logging

### Auto-Approval Risks

- Tools with auto-approval can modify files, run commands
- Users should only auto-approve trusted tools
- Audit log for auto-approved tool calls

## Debugging MCP Servers

### Enable Debug Logging

```typescript
// In settings
{
  "debug": {
    "mcp": true  // Enables verbose MCP logging
  }
}
```

### Common Issues

1. **Server doesn't start**
   - Check command exists in PATH
   - Verify arguments are correct
   - Check file permissions

2. **Tool not showing up**
   - Server must implement `ListToolsRequest`
   - Tool definitions must be valid JSON schema
   - Restart server after changes

3. **Connection timeout**
   - Increase timeout in settings
   - Check network connectivity
   - Verify server is responding

## Related Files

- `src/services/mcp/McpHub.ts` - Main MCP manager
- `src/services/mcp/McpServer.ts` - Server connection class
- `src/services/mcp/McpClient.ts` - Client for MCP protocol
- `src/shared/mcp.ts` - Type definitions
- `src/core/controller/mcp/` - MCP-related UI handlers