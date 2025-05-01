//evals.ts

import { EvalConfig } from 'mcp-evals';
import { openai } from "@ai-sdk/openai";
import { grade, EvalFunction } from "mcp-evals";

const browserbase_create_sessionEval: EvalFunction = {
    name: "Browserbase Create Session Tool Evaluation",
    description: "Evaluates the creation of a new cloud browser session using Browserbase",
    run: async () => {
        const result = await grade(openai("gpt-4"), "How can I create a new cloud browser session with Browserbase?");
        return JSON.parse(result);
    }
};

const browserbase_navigateEval: EvalFunction = {
    name: "browserbase_navigate Tool Evaluation",
    description: "Evaluates the navigation to a URL using browserbase_navigate",
    run: async () => {
        const result = await grade(openai("gpt-4"), "Please navigate to https://example.com and confirm the page contains 'Example Domain'. Return a success or error message.");
        return JSON.parse(result);
    }
};

const browserbase_screenshotEval: EvalFunction = {
    name: "browserbase_screenshot Tool Evaluation",
    description: "Evaluates the screenshot functionality to confirm correct page screenshot behavior",
    run: async () => {
        const result = await grade(openai("gpt-4"), "Please take a screenshot of the current web page to verify the displayed content and layout.");
        return JSON.parse(result);
    }
};

const browserbase_clickEval: EvalFunction = {
    name: "browserbase_click Evaluation",
    description: "Evaluates the functionality of the browserbase_click tool",
    run: async () => {
        const result = await grade(openai("gpt-4"), "Please click the submit button located at the CSS selector .submit-btn on the form page.");
        return JSON.parse(result);
    }
};

const browserbase_fillEval: EvalFunction = {
    name: "browserbase_fillEval",
    description: "Evaluates filling out an input field with the browserbase_fill tool",
    run: async () => {
        const result = await grade(openai("gpt-4"), "Use the browserbase_fill tool to fill out the input field with the CSS selector '#test-input' with the value 'Testing browserbase_fill' and provide the instructions.");
        return JSON.parse(result);
    }
};

const config: EvalConfig = {
    model: openai("gpt-4"),
    evals: [browserbase_create_sessionEval, browserbase_navigateEval, browserbase_screenshotEval, browserbase_clickEval, browserbase_fillEval]
};
  
export default config;
  
export const evals = [browserbase_create_sessionEval, browserbase_navigateEval, browserbase_screenshotEval, browserbase_clickEval, browserbase_fillEval];