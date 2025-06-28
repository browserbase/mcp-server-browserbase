# Browserbase MCP Server

[![smithery badge](https://smithery.ai/badge/@browserbasehq/mcp-browserbase)](https://smithery.ai/server/@browserbasehq/mcp-browserbase)

![cover](assets/cover-mcp.png)

[The Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) is an open protocol that enables seamless integration between LLM applications and external data sources and tools. Whether you're building an AI-powered IDE, enhancing a chat interface, or creating custom AI workflows, MCP provides a standardized way to connect LLMs with the context they need.

This server provides cloud browser automation capabilities using [Browserbase](https://www.browserbase.com/) and [Stagehand](https://github.com/browserbase/stagehand). It enables LLMs to interact with web pages, take screenshots, extract information, and perform automated actions with atomic precision.

## Features

| Feature            | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| Browser Automation | Control and orchestrate cloud browsers via Browserbase      |
| Data Extraction    | Extract structured data from any webpage                    |
| Web Interaction    | Navigate, click, and fill forms with ease                   |
| Screenshots        | Capture full-page and element screenshots                   |
| Model Flexibility  | Supports multiple models (OpenAI, Claude, Gemini, and more) |
| Vision Support     | Use annotated screenshots for complex DOMs                  |
| Session Management | Create, manage, and close browser sessions                  |
| Multi-Session      | Run multiple browser sessions in parallel                   |

### Alternative Installation Methods

[Smithery](https://smithery.ai/server/@browserbasehq/mcp-browserbase)

## How to Setup

### Quickstarts:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.png)](cursor://anysphere.cursor-deeplink/mcp/install?name=browserbase&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAYnJvd3NlcmJhc2VocS9tY3AiXSwiZW52Ijp7IkJST1dTRVJCQVNFX0FQSV9LRVkiOiIiLCJCUk9XU0VSQkFTRV9QUk9KRUNUX0lEIjoiIn19)

You can either use our Server hosted on NPM or run it completely locally by cloning this repo.

### To run on NPM (Recommended)

Go into your MCP Config JSON and add the Browserbase Server:

```json
{
  "mcpServers": {
    "browserbase": {
      "command": "npx",
      "args": ["@browserbasehq/mcp"],
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

That's it! Reload your MCP client and Claude will be able to use Browserbase.

### To run 100% local:

```bash
# Clone the Repo
git clone https://github.com/browserbase/mcp-server-browserbase.git
cd mcp-server-browserbase

# Install the dependencies and build the project
npm install && npm run build
```

Then in your MCP Config JSON run the server. To run locally we can use STDIO or self-host over SSE.

### STDIO:

To your MCP Config JSON file add the following:

```json
{
  "mcpServers": {
    "browserbase": {
      "command": "node",
      "args": ["/path/to/mcp-server-browserbase/cli.js"],
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

### SSE:

Run the following command in your terminal. You can add any flags (see options below) that you see fit to customize your configuration.

```bash
   node cli.js --port 8931
```

Then in your MCP Config JSON file put the following:

```json
{
  "mcpServers": {
    "browserbase": {
      "url": "http://localhost:8931/sse",
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

Then reload your MCP client and you should be good to go!

## Configuration

The Browserbase MCP server accepts the following command-line flags:

| Flag                          | Description                                                                 |
| ----------------------------- | --------------------------------------------------------------------------- |
| `--browserbaseApiKey <key>`   | Your Browserbase API key for authentication                                 |
| `--browserbaseProjectId <id>` | Your Browserbase project ID                                                 |
| `--proxies`                   | Enable Browserbase proxies for the session                                  |
| `--advancedStealth`           | Enable Browserbase Advanced Stealth (Only for Scale Plan Users)             |
| `--contextId <contextId>`     | Specify a Browserbase Context ID to use                                     |
| `--persist [boolean]`         | Whether to persist the Browserbase context (default: true)                  |
| `--port <port>`               | Port to listen on for HTTP/SSE transport                                    |
| `--host <host>`               | Host to bind server to (default: localhost, use 0.0.0.0 for all interfaces) |
| `--cookies [json]`            | JSON array of cookies to inject into the browser                            |
| `--browserWidth <width>`      | Browser viewport width (default: 1024)                                      |
| `--browserHeight <height>`    | Browser viewport height (default: 768)                                      |
| `--modelName <model>`         | The model to use for Stagehand (default: google/gemini-2.0-flash)           |

These flags can be passed directly to the CLI or configured in your MCP configuration file.

### NOTE:

Currently, these flags can only be used with the local server (npx @browserbasehq/mcp).

## Configuration Examples

### Proxies

Here are our docs on [Proxies](https://docs.browserbase.com/features/proxies).

To use proxies, set the --proxies flag in your MCP Config:

```json
{
  "mcpServers": {
    "browserbase": {
      "command": "npx",
      "args": ["@browserbasehq/mcp", "--proxies"],
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

### Advanced Stealth

Here are our docs on [Advanced Stealth](https://docs.browserbase.com/features/stealth-mode#advanced-stealth-mode).

To use advanced stealth, set the --advancedStealth flag in your MCP Config:

```json
{
  "mcpServers": {
    "browserbase": {
      "command": "npx",
      "args": ["@browserbasehq/mcp", "--advancedStealth"],
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

### Contexts

Here are our docs on [Contexts](https://docs.browserbase.com/features/contexts)

To use contexts, set the --contextId flag in your MCP Config:

```json
{
  "mcpServers": {
    "browserbase": {
      "command": "npx",
      "args": ["@browserbasehq/mcp", "--contextId", "<YOUR_CONTEXT_ID>"],
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

### Cookie Injection

Why would you need to inject cookies? Our context API currently works on persistent cookies, but not session cookies. So sometimes our persistent auth might not work (we're working hard to add this functionality).

You can inject cookies into the MCP by adding them to your MCP Config. Your cookies JSON must be in the format of [Playwright Cookies](https://playwright.dev/docs/api/class-browsercontext#browser-context-cookies)

```json
{
  "mcpServers": {
    "browserbase": {
      "command": "npx",
      "args": [
        "@browserbasehq/mcp",
        "--cookies",
        "[{\"name\": \"session\", \"value\": \"abc123\", \"domain\": \".example.com\"}]"
      ],
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

### Browser Viewport Sizing

The default viewport sizing for a browser session is 1024 x 768. You can adjust the Browser viewport sizing with browserWidth and browserHeight flags.

Here's how to use it for custom browser sizing. We recommend to stick with 16:9 aspect ratios (ie: 1920 x 1080, 1280 x 720, 1024 x 768)

```json
{
  "mcpServers": {
    "browserbase": {
      "command": "npx",
      "args": [
        "@browserbasehq/mcp",
        "--browserHeight 1080",
        "--browserWidth 1920"
      ],
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

### Model Configuration

Stagehand defaults to using Google's Gemini 2.0 Flash model, but you can configure it to use other models like GPT-4o, Claude, or other providers.

Here's how to configure different models:

```json
{
  "mcpServers": {
    "browserbase": {
      "command": "npx",
      "args": ["@browserbasehq/mcp", "--modelName", "gpt-4o"],
      "env": {
        "BROWSERBASE_API_KEY": "",
        "BROWSERBASE_PROJECT_ID": ""
      }
    }
  }
}
```

Available models include:

- **Gemini**: `google/gemini-2.0-flash` (default), `google/gemini-1.5-pro`, `google/gemini-1.5-flash`
- **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `o1-mini`, `o1-preview`, `o3-mini`
- **Claude**: `claude-3-5-sonnet-latest`, `claude-3-7-sonnet-latest`
- **Other providers**: Cerebras, Groq, and more

_Note: The model must be supported in Stagehand. Check out the docs [here](https://docs.stagehand.dev/examples/custom_llms#supported-llms)._

## Tools

The Browserbase MCP server provides the following tools for browser automation:

### Browser Automation Tools

- **browserbase_stagehand_navigate**
  - Navigate to any URL in the browser
  - Input:
    - `url` (string): The URL to navigate to

- **browserbase_stagehand_act**
  - Perform an action on the web page using natural language
  - Inputs:
    - `action` (string): The action to perform (e.g., "click the login button")
    - `variables` (object, optional): Variables used in the action template for sensitive data

- **browserbase_stagehand_extract**
  - Extract all text content from the current page (filters out CSS and JavaScript)
  - No inputs required

- **browserbase_stagehand_observe**
  - Observe and find actionable elements on the web page
  - Input:
    - `instruction` (string): Specific instruction for observation (e.g., "find the login button")

- **browserbase_screenshot**
  - Capture a PNG screenshot of the current page
  - No inputs required
  - Output:
    - `text`: Friendly confirmation message with the screenshot name
    - `image`: Base-64 encoded PNG data

### Session Management Tools

- **browserbase_session_create**
  - Create or reuse a cloud browser session using Browserbase with fully initialized Stagehand
  - Applies all configuration flags (proxies, stealth, viewport, cookies, etc.)
  - Initializes Stagehand instance connected to the browser session
  - Input:
    - `sessionId` (string, optional): Optional session ID to use/reuse. If not provided, creates new session
  - Output:
    - Live debugger URL for the Browserbase session

- **browserbase_session_close**
  - Close the current Browserbase session, disconnect the browser, and cleanup Stagehand instance
  - Input:
    - `random_string` (string, optional): Dummy parameter for consistent tool call format
  - Output:
    - Confirmation message and session replay URL

### Multi-Session Management Tools

The server supports managing multiple independent browser sessions in parallel, allowing you to control multiple browsers simultaneously for complex automation workflows:

#### Session Lifecycle Management

- **multi_browserbase_stagehand_session_create**
  - Create a new independent Stagehand browser session with full web automation capabilities
  - Each session is isolated with its own browser instance, cookies, and state
  - Inputs:
    - `name` (string, optional): Human-readable name for tracking (e.g., 'login-flow', 'data-scraping')
    - `browserbaseSessionID` (string, optional): Resume an existing Browserbase session by ID
    - `browserbaseSessionCreateParams` (object, optional): Advanced Browserbase configuration
  - Output:
    - Session ID and Browserbase session ID with live debugger URL

- **browserbase_stagehand_session_list**
  - List all currently active Stagehand browser sessions with detailed metadata
  - Shows session IDs, names, Browserbase session IDs, creation time, and age
  - No inputs required
  - Output:
    - Comprehensive list of active sessions with status information

- **multi_browserbase_stagehand_session_close**
  - Close and clean up a specific Stagehand browser session
  - Terminates browser instance, ends Browserbase session, and frees resources
  - Input:
    - `sessionId` (string): Exact session ID to close (cannot be undone)
  - Output:
    - Confirmation message with session replay URL

#### Session-Specific Browser Automation

All core browser automation tools are available with session-specific variants:

- **multi_browserbase_stagehand_navigate_session**
  - Navigate to a URL in a specific browser session
  - Inputs:
    - `sessionId` (string): The session ID to use
    - `url` (string): The URL to navigate to

- **multi_browserbase_stagehand_act_session**
  - Perform an action in a specific browser session using natural language
  - Inputs:
    - `sessionId` (string): The session ID to use
    - `action` (string): The action to perform (e.g., "click the login button")
    - `variables` (object, optional): Variables for sensitive data in action templates

- **multi_browserbase_stagehand_extract_session**
  - Extract structured information from a specific browser session
  - Inputs:
    - `sessionId` (string): The session ID to use
    - `instruction` (string): What to extract from the page

- **multi_browserbase_stagehand_observe_session**
  - Observe and find actionable elements in a specific browser session
  - Inputs:
    - `sessionId` (string): The session ID to use
    - `instruction` (string): What to observe (e.g., "find the login button")
    - `returnAction` (boolean, optional): Whether to return the action to perform

#### Multi-Session Use Cases

- **Parallel Data Collection**: Run multiple scraping sessions simultaneously across different websites
- **A/B Testing**: Compare user flows across different browser sessions with varying configurations
- **Authentication Workflows**: Maintain separate authenticated sessions for different user accounts
- **Cross-Site Operations**: Perform coordinated actions across multiple websites or applications
- **Load Testing**: Simulate multiple users interacting with web applications concurrently
- **Backup Sessions**: Keep fallback sessions ready in case primary sessions encounter issues

### Resources

The server provides access to screenshot resources:

1. **Screenshots** (`screenshot://<screenshot-name>`)
   - PNG images of captured screenshots

## Project Structure

```
mcp-server-browserbase/
├── src/                          # TypeScript source code
│   ├── index.ts                  # Main entry point and Smithery default export
│   ├── config.ts                 # Configuration management and CLI parsing
│   ├── context.ts                # Context class managing Stagehand instances
│   ├── sessionManager.ts         # Browserbase session lifecycle management
│   ├── stagehandStore.ts         # Multi-session store for managing parallel browser sessions
│   ├── program.ts                # CLI program setup using Commander.js
│   ├── transport.ts              # HTTP/SSE and STDIO transport handlers
│   ├── server.ts                 # Server list management
│   ├── utils.ts                  # Utility functions
│   ├── mcp/                      # MCP protocol implementations
│   │   ├── prompts.ts            # Prompt templates and handlers for MCP clients
│   │   └── resources.ts          # Resource management (screenshots) with URI-based access
│   ├── tools/                    # Tool definitions and implementations
│   │   ├── act.ts                # Stagehand action execution tool
│   │   ├── extract.ts            # Page content extraction tool
│   │   ├── navigate.ts           # URL navigation tool
│   │   ├── observe.ts            # Element observation tool
│   │   ├── screenshot.ts         # Screenshot capture tool
│   │   ├── session.ts            # Single session management tools
│   │   ├── multiSession.ts       # Multi-session management and session-aware tools
│   │   ├── tool.ts               # Tool type definitions and interfaces
│   │   └── index.ts              # Tool exports and registration
│   └── types/                    # TypeScript type definitions
│       └── types.ts              # Shared type definitions for sessions and configurations
├── dist/                         # Compiled JavaScript output
├── assets/                       # Images and documentation assets
├── cli.js                        # Executable entry point for CLI usage
├── config.d.ts                   # TypeScript type definitions
├── index.d.ts & index.js         # Module exports for programmatic usage
├── package.json                  # Package metadata and dependencies
├── smithery.config.js            # Smithery configuration
├── tsconfig.json                 # TypeScript compiler configuration
└── README.md                     # This file
```

## Module Descriptions

### Core Modules

**index.ts** - The main Smithery export function that creates and configures the MCP server with Zod schema validation, tool registration, and proper metadata.

**config.ts** - Configuration management handling CLI options, environment variables, defaults, and Browserbase API validation.

**context.ts** - The Context class that manages Stagehand instances per session, executes tool actions with error handling, and coordinates between tools and sessions.

**sessionManager.ts** - Creates and manages Browserbase sessions via CDP, handles session lifecycle, cookie injection, and tracks active sessions.

### Infrastructure

**program.ts** - CLI program setup using Commander.js with all command-line options, argument parsing, and transport initialization.

**transport.ts** - Transport layer implementations for STDIO and HTTP/SSE communication with session management across different connection types.

**server.ts** - Server list management providing factory patterns for server creation and handling multiple concurrent connections.

**stagehandStore.ts** - Multi-session store managing parallel browser sessions with lifecycle tracking, automatic cleanup, and session metadata.

### MCP Protocol Specifics Implementation

**mcp/prompts.ts** - Prompt template definitions and handlers implementing the MCP prompts specification with argument substitution.

**mcp/resources.ts** - Resource management implementing the MCP resources specification, handling screenshot storage, URI resolution, and base64-encoded data serving.

### Tools & Types

**tools/** - Individual tool implementations with type-safe Zod schemas including:

- Core browser automation tools (navigate, act, extract, observe, screenshot)
- Single session management tools (session.ts)
- Multi-session management and session-aware tool variants (multiSession.ts)
- Tool type definitions and interfaces (tool.ts)
- Centralized tool exports and registration (index.ts)

**types/types.ts** - Shared TypeScript type definitions for sessions, configurations, and MCP protocol structures.

**utils.ts** - Message sanitization utilities ensuring proper JSON formatting for MCP messages.

## Environment Variables

- `BROWSERBASE_API_KEY`: API key for Browserbase authentication (required)
- `BROWSERBASE_PROJECT_ID`: Project ID for Browserbase (required)
- `DEBUG`: Enable debug logging (optional)

## MCP Capabilities

This server implements the following MCP capabilities:

- **Tools**: 14 tools for comprehensive browser automation
  - 5 Core Stagehand tools: navigate, act, extract, observe, screenshot
  - 2 Single-session management tools: create and close Browserbase sessions
  - 7 Multi-session tools: create, list, close, navigate, act, extract, observe with specific sessions
- **Prompts**: Prompt templates for common automation tasks
- **Resources**: Screenshot resource management with URI-based access

### Session Management Architecture

The server supports two session management approaches:

1. **Single Session Mode**: Traditional approach with one active browser session
   - Tools: `browserbase_session_create`, `browserbase_session_close`
   - Simpler for basic automation tasks
   - Automatically manages the active session

2. **Multi-Session Mode**: Advanced approach with multiple parallel browser sessions
   - Tools: `multi_browserbase_stagehand_session_create`, `multi_browserbase_stagehand_session_close`, `browserbase_stagehand_session_list`
   - Session-specific variants of all core tools (with `_session` suffix)
   - Ideal for complex workflows requiring parallel browser instances
   - Each session maintains independent state, cookies, and browser context

## Key Features

- **AI-Powered Automation**: Natural language commands for web interactions
- **Multi-Model Support**: Works with OpenAI, Claude, Gemini, and more
- **Advanced Session Management**: Single and multi-session support for parallel browser automation
- **Screenshot Capture**: Full-page and element-specific screenshots
- **Data Extraction**: Intelligent content extraction from web pages
- **Proxy Support**: Enterprise-grade proxy capabilities
- **Stealth Mode**: Advanced anti-detection features
- **Context Persistence**: Maintain authentication and state across sessions
- **Parallel Workflows**: Run multiple browser sessions simultaneously for complex automation tasks

For more information about the Model Context Protocol, visit:

- [MCP Documentation](https://modelcontextprotocol.io/docs)
- [MCP Specification](https://spec.modelcontextprotocol.io/)

## License

Licensed under the MIT License.

Copyright 2025 Browserbase, Inc.
