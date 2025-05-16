import { z } from 'zod'; 
import { defineTool, type ToolFactory } from './tool.js'; 

const pressKey: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browserbase_press_key',
    description: 'Press a key on the keyboard',
    inputSchema: z.object({
      key: z.string().describe('Name of the key to press or a character to generate, such as `ArrowLeft` or `a`'),
    }),
  },

  handle: async (context, params) => {
    const page = await context.getActivePage();
    if (!page) {
      throw new Error('No active page found for pressKey');
    }

    const code = [
      `// Press ${params.key}`,
      `await page.keyboard.press('${params.key.replace(/'/g, "\\'")}');`, 
    ];

    const action = () => page.keyboard.press(params.key); // Changed from tab.page to page

    return {
      code,
      action,
      captureSnapshot, 
      waitForNetwork: true 
    };
  },
});

const captureSnapshotValue = true;

export default [
  pressKey(captureSnapshotValue),
]; 