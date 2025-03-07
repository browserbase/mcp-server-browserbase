# Stagehand MCP Server

[![smithery badge](https://smithery.ai/badge/@browserbasehq/mcp-stagehand)](https://smithery.ai/server/@browserbasehq/mcp-stagehand)
![cover](../assets/stagehand-mcp.png)

A Model Context Protocol (MCP) server that provides AI-powered web automation capabilities using [Stagehand](https://github.com/browserbase/stagehand). This server enables LLMs to interact with web pages, perform actions, extract data, and observe possible actions in a real browser environment.

## Get Started

### Installing via Smithery

To install Stagehand for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@browserbasehq/mcp-stagehand):

```bash
npx -y @smithery/cli install @browserbasehq/mcp-stagehand --client claude
```

### Manual Installation
1. Run `npm install` to install the necessary dependencies, then run `npm run build` to get `dist/index.js`.

2. Set up your Claude Desktop configuration to use the server.  

```json
{
  "mcpServers": {
    "stagehand": {
      "command": "node",
      "args": ["path/to/mcp-server-browserbase/stagehand/dist/index.js"],
      "env": {
        "BROWSERBASE_API_KEY": "<YOUR_BROWSERBASE_API_KEY>",
        "BROWSERBASE_PROJECT_ID": "<YOUR_BROWSERBASE_PROJECT_ID>",
        "OPENAI_API_KEY": "<YOUR_OPENAI_API_KEY>",
      }
    }
  }
}
```

3. Restart your Claude Desktop app and you should see the tools available clicking the 🔨 icon.

4. Start using the tools! Below is a demo video of Claude doing a Google search for OpenAI using stagehand MCP server and Browserbase for a remote headless browser.

<div>
    <a href="https://www.loom.com/share/9fe52fd9ab24421191223645366ec1c5">
      <p>Stagehand MCP Server demo - Watch Video</p>
    </a>
    <a href="https://www.loom.com/share/9fe52fd9ab24421191223645366ec1c5">
      <img style="max-width:300px;" src="https://cdn.loom.com/sessions/thumbnails/9fe52fd9ab24421191223645366ec1c5-f1a228ffe52d8065-full-play.gif">
    </a>
  </div>

## Tools

### Stagehand commands

- **stagehand_navigate**
  - Navigate to any URL in the browser
  - Input:
    - `url` (string): The URL to navigate to

- **stagehand_act**
  - Perform an action on the web page
  - Inputs:
    - `action` (string): The action to perform (e.g., "click the login button")
    - `variables` (object, optional): Variables used in the action template

- **stagehand_extract**
  - Extract data from the web page based on an instruction and schema
  - Inputs:
    - `instruction` (string): Instruction for extraction (e.g., "extract the price of the item")
    - `schema` (object): JSON schema for the extracted data

- **stagehand_observe**
  - Observe actions that can be performed on the web page
  - Input:
    - `instruction` (string, optional): Instruction for observation

### Resources

The server provides access to two types of resources:

1. **Console Logs** (`console://logs`)

   - Browser console output in text format
   - Includes all console messages from the browser

2. **Screenshots** (`screenshot://<name>`)
   - PNG images of captured screenshots
   - Accessible via the screenshot name specified during capture

## Key Features

- AI-powered web automation
- Perform actions on web pages
- Extract structured data from web pages
- Observe possible actions on web pages
- Simple and extensible API
- Model-agnostic support for various LLM providers

## License

Licensed under the MIT License.

Copyright 2024 Browserbase, Inc.
