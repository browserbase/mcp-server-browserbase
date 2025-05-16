# Playwright Browserbase MCP Server

![cover](../assets/browserbase-mcp.png)

The Model Context Protocol (MCP) is an open protocol that enables seamless integration between LLM applications and external data sources and tools. Whether you’re building an AI-powered IDE, enhancing a chat interface, or creating custom AI workflows, MCP provides a standardized way to connect LLMs with the context they need. 

<div>
   <a href="https://www.loom.com/share/d285d6093b2843e98908c65592031218">
   <img style="max-width:600px;" src="https://cdn.loom.com/sessions/thumbnails/d285d6093b2843e98908c65592031218-1ab1288912ffd40c-full-play.gif">
   </a>
</div>

## How to setup in MCP json

You can either use our Server hosted on NPM or run it completely locally by cloning this repo. 

### To run on NPM (Recommended)

Go into your MCP Config JSON and add the Browserbase Server:

```json
{
   "mcpServers": {
      "browserbase": {
         "command": "npx",
         "args" : ["@browserbasehq/mcp"],
         "env": {
            "BROWSERBASE_API_KEY": "",
            "BROWSERBASE_PROJECT_ID": ""
         }
      }
   }
}
```

Thats it! Reload your MCP client and Claude will be able to use Browserbase. 

### To run 100% local: 

```bash
# Clone the Repo 
git clone https://github.com/browserbase/mcp-server-browserbase.git

# Install the dependencies in the proper directory and build the project
cd browserbase
npm install && npm run build

```

Then in your MCP Config JSON run the server. To run locally we can use STDIO or self-host over SSE. 

### STDIO: 

To your MCP Config JSON file add the following: 

```json
{
"mcpServers": {
   "browserbase": {
      "command" : "node",
      "args" : ["/path/to/mcp-server-browserbase/browserbase/cli.js"],
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

## Flags Explained:

The Browserbase MCP server accepts the following command-line flags:

| Flag | Description |
|------|-------------|
| `--browserbaseApiKey <key>` | Your Browserbase API key for authentication |
| `--browserbaseProjectId <id>` | Your Browserbase project ID |
| `--proxies` | Enable Browserbase proxies for the session |
| `--advancedStealth` | Enable Browserbase Advanced Stealth (Only for Scale Plan Users) | 
| `--contextId <contextId>` | Specify a Browserbase Context ID to use |
| `--persist [boolean]` | Whether to persist the Browserbase context (default: true) |
| `--port <port>` | Port to listen on for HTTP/SSE transport |
| `--host <host>` | Host to bind server to (default: localhost, use 0.0.0.0 for all interfaces) |
| `--cookies [json]` | JSON array of cookies to inject into the browser |
| `--browserWidth <width>` | Browser viewport width (default: 1024) |
| `--browserHeight <height>` | Browser viewport height (default: 768) |

These flags can be passed directly to the CLI or configured in your MCP configuration file.

### NOTE: 

Currently, these flags can only be used with the local server (npx @browserbasehq/mcp). 

____

## Flags & Example Configs

### Proxies

Here are our docs on [Proxies](https://docs.browserbase.com/features/proxies).

To use proxies in STDIO, set the --proxies flag in your MCP Config:

```json
{
   "mcpServers": {
      "browserbase": {
         "command" : "npx",
         "args" : ["@browserbasehq/mcp", "--proxies"],
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

To use proxies in STDIO, set the --advancedStealth flag in your MCP Config:

```json
{
   "mcpServers": {
      "browserbase": {
         "command" : "npx",
         "args" : ["@browserbasehq/mcp", "--advancedStealth"],
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

To use contexts in STDIO, set the --contextId flag in your MCP Config:

```json
{
   "mcpServers": {
      "browserbase": {
         "command" : "npx",
         "args" : ["@browserbasehq/mcp", "--contextId", "<YOUR_CONTEXT_ID>"],
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

You can flag cookies into the MCP by adding the cookies.json to your MCP Config.

To use proxies in STDIO, set the --proxies flag in your MCP Config. Your cookies JSON must be in the type of [Playwright Cookies](https://playwright.dev/docs/api/class-browsercontext#browser-context-cookies)

```json
{
   "mcpServers": {
      "browserbase" {
         "command" : "npx",
         "args" : [
            "@browserbasehq/mcp", "--cookies", 
            '{
               "cookies": json,
            }'
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

Here's how to use it for custom browser sizing. We recommend to stick with 16:9 aspect ratios (ie: 1920 x 1080, 1280, 720, 1024 x 768)

```json
{
   "mcpServers": {
      "browserbase": {
         "command" : "npx",
         "args" : [
            "@browserbasehq/mcp",
            "--browserHeight 1080",
            "--browserWidth 1920",
         ],
         "env": {
            "BROWSERBASE_API_KEY": "",
            "BROWSERBASE_PROJECT_ID": ""
         }
      }
   }
}
```

## Structure

*   `src/`: TypeScript source code
    *   `index.ts`: Main entry point, env checks, shutdown
    *   `server.ts`: MCP Server setup and request routing
    *   `sessionManager.ts`: Handles Browserbase session creation/management
    *   `tools/`: Tool definitions and implementations
    *   `resources/`: Resource (screenshot) handling
    *   `types.ts`: Shared TypeScript types
*   `dist/`: Compiled JavaScript output
*   `tests/`: Placeholder for tests
*   `utils/`: Placeholder for utility scripts
*   `Dockerfile`: For building a Docker image
*   Configuration files (`.json`, `.ts`, `.mjs`, `.npmignore`)

## Contexts for Persistence

This server supports Browserbase's Contexts feature, which allows persisting cookies, authentication, and cached data across browser sessions:

1. **Creating a Context**:
   ```
   browserbase_context_create: Creates a new context, optionally with a friendly name
   ```

2. **Using a Context with a Session**:
   ```
   browserbase_session_create: Now accepts a 'context' parameter with:
     - id: The context ID to use
     - name: Alternative to ID, the friendly name of the context
     - persist: Whether to save changes (cookies, cache) back to the context (default: true)
   ```

3. **Deleting a Context**:
   ```
   browserbase_context_delete: Deletes a context when you no longer need it
   ```

Contexts make it much easier to:
- Maintain login state across sessions
- Reduce page load times by preserving cache
- Avoid CAPTCHAs and detection by reusing browser fingerprints

## Cookie Management

This server also provides direct cookie management capabilities:

1. **Adding Cookies**:
   ```
   browserbase_cookies_add: Add cookies to the current browser session with full control over properties
   ```

2. **Getting Cookies**:
   ```
   browserbase_cookies_get: View all cookies in the current session (optionally filtered by URLs)
   ```

3. **Deleting Cookies**:
   ```
   browserbase_cookies_delete: Delete specific cookies or clear all cookies from the session
   ```

These tools are useful for:
- Setting authentication cookies without navigating to login pages
- Backing up and restoring cookie state
- Debugging cookie-related issues
- Manipulating cookie attributes (expiration, security flags, etc.)

## TODO/Roadmap

*   Implement true `ref`-based interaction logic for click, type, drag, hover, select_option.
*   Implement element-specific screenshots using `ref`.
*   Add more standard MCP tools (tabs, navigation, etc.).
*   Add tests.
