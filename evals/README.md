# Browserbase MCP Server Evaluation Tests

This directory contains comprehensive evaluation tests for the Browserbase MCP Server using [MCPVals](https://github.com/modelcontextprotocol/mcpvals), a testing framework that uses Claude to autonomously execute test workflows based on natural language descriptions.

## Quick Start

1. **Install dependencies:**

   ```bash
   npm run test:install
   ```

2. **Set up environment variables:**

   ```bash
   export BROWSERBASE_API_KEY="your_api_key_here"
   export BROWSERBASE_PROJECT_ID="your_project_id_here"
   export ANTHROPIC_API_KEY="your_anthropic_key_here"
   ```

3. **Run basic tests:**
   ```bash
   npm test
   ```

## Test Configurations

We provide three levels of testing:

### 1. Minimal Tests (`mcp-eval-minimal.config.json`)

- **Purpose**: Quick smoke tests to verify basic functionality
- **Duration**: ~2-3 minutes
- **Tests**: 3 workflows covering navigation, extraction, and multi-session basics
- **Usage**: `npm run test:minimal`

### 2. Standard Tests (`mcp-eval.config.json`)

- **Purpose**: Comprehensive functionality testing
- **Duration**: ~5-10 minutes
- **Tests**: 8 workflows covering all major features
- **Usage**: `npm test`

### 3. Advanced Tests (`mcp-eval-advanced.config.json`)

- **Purpose**: Complex scenarios with LLM judge evaluation
- **Duration**: ~10-15 minutes
- **Tests**: 6 workflows with subjective quality assessment
- **Usage**: `npm run test:advanced` (requires `OPENAI_API_KEY`)

## Available Scripts

| Script                  | Description                       |
| ----------------------- | --------------------------------- |
| `npm test`              | Run standard evaluation tests     |
| `npm run test:minimal`  | Run minimal smoke tests           |
| `npm run test:advanced` | Run advanced tests with LLM judge |
| `npm run test:all`      | Run all test suites               |
| `npm run test:debug`    | Run tests with debug output       |
| `npm run test:json`     | Run tests with JSON output        |
| `npm run test:install`  | Install test dependencies         |
| `npm run test:runner`   | Direct access to test runner      |

## Understanding the Test Framework

### How MCPVals Works

MCPVals uses Claude to autonomously execute test workflows:

1. **Natural Language Instructions**: Tests are written as natural language prompts
2. **Autonomous Execution**: Claude examines available MCP tools and plans execution
3. **Tool Invocation**: Claude calls the appropriate MCP tools to accomplish tasks
4. **Deterministic Evaluation**: Results are evaluated against expected outcomes

### Test Structure

Each test workflow contains:

```json
{
  "name": "test-name",
  "description": "What this test validates",
  "steps": [
    {
      "user": "Natural language instruction",
      "expectedState": "Expected substring in output"
    }
  ],
  "expectTools": ["list", "of", "expected", "tools"]
}
```

### Evaluation Metrics

Each test is evaluated on three metrics:

1. **End-to-End Success** (0-100%): Did the workflow achieve the expected final state?
2. **Tool Invocation Order** (0-100%): Were the expected tools called in the correct sequence?
3. **Tool Call Health** (0-100%): Did all tool calls complete successfully without errors?

**Overall Score** = Average of all three metrics

## Test Workflows

### Minimal Test Suite

| Workflow                   | Description              | Expected Tools                                    |
| -------------------------- | ------------------------ | ------------------------------------------------- |
| `smoke-test-navigation`    | Basic browser navigation | session_create, navigate, session_close           |
| `smoke-test-extraction`    | Basic content extraction | session_create, navigate, extract, session_close  |
| `smoke-test-multi-session` | Multi-session management | multi_session_create, session_list, session_close |

### Standard Test Suite

| Workflow                    | Description                | Key Features                 |
| --------------------------- | -------------------------- | ---------------------------- |
| `basic-navigation-test`     | Navigation to Google       | Basic browser control        |
| `search-and-extract-test`   | Search and extract results | Form interaction, extraction |
| `observe-and-interact-test` | Element observation        | DOM inspection               |
| `screenshot-test`           | Screenshot capture         | Visual documentation         |
| `multi-session-test`        | Parallel browser sessions  | Multi-session management     |
| `form-interaction-test`     | Form filling               | Input handling               |
| `error-handling-test`       | Error scenarios            | Error recovery               |

### Advanced Test Suite

| Workflow                     | Description                 | LLM Judge |
| ---------------------------- | --------------------------- | --------- |
| `e-commerce-workflow`        | Realistic browsing patterns | ✓         |
| `form-interaction-workflow`  | Complex form handling       | ✓         |
| `dynamic-content-handling`   | JavaScript content          | ✓         |
| `multi-session-workflow`     | Advanced multi-session      | ✓         |
| `error-recovery-workflow`    | Error handling & recovery   | ✓         |
| `comprehensive-feature-test` | All features combined       | ✓         |

## Environment Setup

### Required Environment Variables

Copy the example environment file and update with your credentials:

```bash
cp evals/env.example .env
# Edit .env with your actual API keys
```

Or set the environment variables directly:

```bash
# Browserbase credentials (required)
export BROWSERBASE_API_KEY="bb_api_key_..."
export BROWSERBASE_PROJECT_ID="bb_project_id_..."

# Anthropic API key (required for Claude execution)
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI API key (required for LLM judge)
export OPENAI_API_KEY="sk-..."
```

### Optional Configuration

You can override placeholder values in the config files by setting environment variables:

```bash
# Override config placeholders
export BROWSERBASE_API_KEY="your_real_key"
export BROWSERBASE_PROJECT_ID="your_real_project"
```

## Running Tests

### Command Line Interface

```bash
# Basic usage
npm test

# With options
npm run test:debug     # Enable debug output
npm run test:json      # Output results as JSON
npm run test:minimal   # Run minimal tests
npm run test:advanced  # Run advanced tests with LLM judge
npm run test:all       # Run all test suites
```

### TypeScript Runner

```bash
# Using the TypeScript runner directly
npm run test:runner run --config evals/mcp-eval.config.json --debug
```

## Interpreting Results

### Console Output

```
✓ basic-navigation-test PASSED (100%)
  ✓ End-to-End Success: 100%
  ✓ Tool Invocation Order: 100%
  ✓ Tool Call Health: 100%

✗ search-and-extract-test FAILED (67%)
  ✓ End-to-End Success: 100%
  ✗ Tool Invocation Order: 67% (2/3 tools in correct order)
  ✓ Tool Call Health: 100%
```

### Understanding Failures

Common failure patterns:

1. **Tool Order Issues**: Expected tools not called in sequence
2. **Missing Tools**: Expected tools not invoked
3. **Tool Errors**: Tools returning errors or timeouts
4. **Wrong Output**: Expected state not found in results

## Troubleshooting

### Common Issues

1. **Missing Dependencies**

   ```bash
   npm run test:install
   ```

2. **Environment Variables Not Set**

   ```bash
   # Check if variables are set
   echo $BROWSERBASE_API_KEY
   echo $BROWSERBASE_PROJECT_ID
   echo $ANTHROPIC_API_KEY
   ```

3. **Timeout Issues**
   - Increase timeout in config files
   - Check network connectivity
   - Verify Browserbase service status

4. **Tool Not Found Errors**
   - Verify MCP server is running correctly
   - Check tool names in config match server exports
   - Run with `npm run test:debug` for detailed output

### Debug Mode

Run tests with debug output to see detailed execution:

```bash
npm run test:debug
```

This shows:

- Raw tool calls and responses
- Claude's reasoning process
- Network requests and responses
- Detailed error messages

## Extending Tests

### Adding New Workflows

1. **Choose appropriate config file** based on complexity
2. **Write natural language steps** that describe user intent
3. **Specify expected tools** that should be called
4. **Set expected states** for validation
5. **Test your workflow** with debug mode

### Example New Workflow

```json
{
  "name": "custom-workflow",
  "description": "Test custom functionality",
  "steps": [
    {
      "user": "Navigate to example.com and find all links",
      "expectedState": "found links"
    },
    {
      "user": "Click on the first link",
      "expectedState": "clicked"
    }
  ],
  "expectTools": [
    "browserbase_session_create",
    "browserbase_stagehand_navigate",
    "browserbase_stagehand_observe",
    "browserbase_stagehand_act"
  ]
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: MCP Server Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "18"
      - run: npm ci
      - run: npm run test:install
      - run: npm run test:minimal
        env:
          BROWSERBASE_API_KEY: ${{ secrets.BROWSERBASE_API_KEY }}
          BROWSERBASE_PROJECT_ID: ${{ secrets.BROWSERBASE_PROJECT_ID }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed
- `2`: Configuration or setup error

## Best Practices

1. **Start with minimal tests** for quick feedback
2. **Use realistic scenarios** that match actual usage
3. **Include error cases** to test robustness
4. **Keep expected states simple** but unique
5. **Run tests regularly** to catch regressions
6. **Use debug mode** when developing new tests

## Support

For issues with:

- **MCPVals framework**: Check the [MCPVals documentation](https://github.com/modelcontextprotocol/mcpvals)
- **Browserbase integration**: Visit [Browserbase docs](https://docs.browserbase.com)
- **MCP Server**: Open an issue in this repository

## License

These tests are part of the Browserbase MCP Server project and are licensed under the Apache License 2.0.
