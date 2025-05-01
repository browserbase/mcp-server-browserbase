/**
 * Configuration handling for the MCP Browserbase server
 */

/**
 * Parse command line arguments to extract configuration
 * @returns {import('./config').Config} The configuration object
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    proxies: false, // Default value
  };

  // Check for --proxies flag (either as standalone flag or with value)
  const proxiesIndex = args.indexOf('--proxies');
  if (proxiesIndex !== -1) {
    // If --proxies exists as an argument
    const nextArg = args[proxiesIndex + 1];
    
    // Case 1: --proxies (standalone flag)
    if (!nextArg || nextArg.startsWith('--')) {
      config.proxies = true;
    } 
    // Case 2: --proxies true/false/1/0
    else {
      const value = nextArg.toLowerCase();
      config.proxies = value === 'true' || value === '1';
    }
  }

  console.error(`Config initialized with proxies: ${config.proxies}`);
  return config;
}

module.exports = {
  parseArgs,
}; 