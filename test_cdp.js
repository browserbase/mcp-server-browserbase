const playwright = require('playwright');

async function main() {
  const cdpUrl = "http://localhost:9222";
  console.log(`Attempting to connect to Chromium over CDP at ${cdpUrl}...`);

  try {
    const browser = await playwright.chromium.connectOverCDP(cdpUrl);
    console.log(`Successfully connected to Chromium over CDP!`);
    console.log(`Browser version: ${browser.version()}`);

    const context = await browser.newContext();
    console.log("Browser context created.");

    const page = await context.newPage();
    console.log("New page created.");

    console.log("Navigating to https://www.example.com...");
    await page.goto('https://www.example.com');
    console.log("Navigation successful.");

    const pageTitle = await page.title();
    console.log(`Page title: "${pageTitle}"`);

    console.log("Closing browser connection...");
    await browser.close();
    console.log("Browser connection closed.");

  } catch (error) {
    console.error(`Failed to connect to Chromium over CDP at ${cdpUrl}.`);
    console.error("Error details:", error);
    // Exit with a non-zero code to indicate failure
    process.exit(1); 
  }
}

main();
