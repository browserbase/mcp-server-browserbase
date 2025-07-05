/**
 * Prompts module for the Browserbase MCP server
 * Contains prompts definitions and handlers for prompt-related requests
 * Docs: https://modelcontextprotocol.io/docs/concepts/prompts
 */

// Define the prompts
export const PROMPTS = [
  {
    name: "browserbase_system",
    description:
      "System prompt defining the scope and capabilities of Browserbase MCP server",
    arguments: [],
  },
  {
    name: "multi_session_guidance",
    description:
      "Guidance on when and how to use multi-session browser automation",
    arguments: [],
  },
];

/**
 * Get a prompt by name
 * @param name The name of the prompt to retrieve
 * @returns The prompt definition or throws an error if not found
 */
export function getPrompt(name: string) {
  if (name === "browserbase_system") {
    return {
      description: "System prompt for Browserbase MCP server capabilities",
      messages: [
        {
          role: "system",
          content: {
            type: "text",
            text: `You have access to a powerful browser automation server via Browserbase MCP. This server provides:

CAPABILITIES:
- Cloud browser automation using Browserbase infrastructure
- AI-powered web interactions via Stagehand
- Parallel browser sessions for concurrent tasks
- Advanced stealth mode for anti-detection
- Proxy support for geo-location and privacy
- Context persistence for maintaining authentication
- Screenshot capture and visual analysis
- Structured data extraction from any webpage

TOOL SELECTION GUIDE:
For SINGLE browser tasks: Use "browserbase_session_create" then regular tools
For MULTIPLE browser tasks: Use "multi_browserbase_stagehand_session_create" then session-specific tools

MULTI-SESSION INDICATORS - Use multi-session tools when you see:
- "parallel", "multiple", "simultaneously", "concurrent"
- "different accounts", "A/B test", "compare"
- "multiple sites", "batch processing"
- Any task requiring more than one browser instance

MULTI-SESSION WORKFLOW:
1. Create sessions: "multi_browserbase_stagehand_session_create" (give descriptive names)
2. Track sessions: "multi_browserbase_stagehand_session_list"
3. Use session tools: "multi_browserbase_stagehand_navigate_session", etc.
4. Cleanup: "multi_browserbase_stagehand_session_close"

BEST PRACTICES:
- Use descriptive session names for easier tracking
- Always close sessions when done to free resources
- Take screenshots for visual confirmation or debugging
- Each session maintains independent state and authentication
- No need to create backup sessions - sessions are reliable and persistent

When using this server, think of it as controlling real browsers in the cloud. You can navigate, click, type, extract data, and capture screenshots just like a human would, but with the precision and scale of automation.`,
          },
        },
      ],
    };
  }

  if (name === "multi_session_guidance") {
    return {
      description: "Comprehensive guidance on multi-session browser automation",
      messages: [
        {
          role: "system",
          content: {
            type: "text",
            text: `Multi-Session Browser Automation Guidance

WHEN TO USE MULTI-SESSION TOOLS:
- Parallel data collection from multiple websites
- A/B testing with different user flows
- Authentication with multiple user accounts simultaneously  
- Cross-site operations requiring coordination
- Load testing or performance simulation
- Any task requiring more than one browser instance

TOOL NAMING PATTERNS:
- Session Management: "multi_browserbase_stagehand_session_*"
- Browser Actions: "multi_browserbase_stagehand_*_session" 

RECOMMENDED WORKFLOW:
1. Create sessions: "multi_browserbase_stagehand_session_create" (give each a descriptive name)
2. List sessions: "multi_browserbase_stagehand_session_list" (to track active sessions)
3. Use session-specific tools: "multi_browserbase_stagehand_navigate_session", "multi_browserbase_stagehand_act_session", etc.
4. Clean up: "multi_browserbase_stagehand_session_close" when done

IMPORTANT RULES:
- Always use session-specific tools (with "_session" suffix) when working with multiple sessions
- Each session maintains independent cookies, authentication, and browser state
- Always close sessions when finished to free resources
- Use descriptive session names for easier tracking
- No need to create backup sessions - sessions are reliable and persistent

SINGLE VS MULTI-SESSION:
- Single: "browserbase_session_create" → "browserbase_stagehand_navigate" 
- Multi: "multi_browserbase_stagehand_session_create" → "multi_browserbase_stagehand_navigate_session"`,
          },
        },
      ],
    };
  }

  throw new Error(`Invalid prompt name: ${name}`);
}
