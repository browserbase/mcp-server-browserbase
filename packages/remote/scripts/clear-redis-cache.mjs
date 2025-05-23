import { createClient } from 'redis';
import { Command } from 'commander';

const program = new Command();

program
  .description('Clear Redis cache for MCP Server')
  .option('-a, --all', 'Clear all cache')
  .option('-p, --project <id>', 'Clear cache for specific project ID')
  .option('-u, --url <url>', 'Redis URL', process.env.REDIS_URL || 'redis://127.0.0.1:6379')
  .option('-v, --verbose', 'Verbose output')
  .parse(process.argv);

const options = program.opts();

if (!options.all && !options.project) {
  console.error('Error: You must specify either --all or --project <id>');
  program.help();
  process.exit(1);
}

async function main() {
  try {
    // Connect to Redis
    console.log(`Connecting to Redis at ${options.url}...`);
    const redisClient = createClient({ url: options.url });
    
    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
      process.exit(1);
    });
    
    await redisClient.connect();
    console.log('Connected to Redis.');
    
    if (options.all) {
      // Clear all cache keys with pattern "mcp:ctx:*"
      const pattern = 'mcp:ctx:*';
      const scanIterator = redisClient.scanIterator({ MATCH: pattern });
      
      let count = 0;
      for await (const key of scanIterator) {
        await redisClient.del(key);
        count++;
        if (options.verbose) {
          console.log(`Deleted: ${key}`);
        }
      }
      
      console.log(`Cleared ${count} cache entries.`);
    } else if (options.project) {
      // Clear specific project cache
      const key = `mcp:ctx:${options.project}`;
      const exists = await redisClient.exists(key);
      
      if (exists) {
        await redisClient.del(key);
        console.log(`Cleared cache for project: ${options.project}`);
      } else {
        console.log(`No cache found for project: ${options.project}`);
      }
    }
    
    await redisClient.quit();
    console.log('Disconnected from Redis.');
  } catch (error) {
    console.error('Failed to clear Redis cache:', error);
    process.exit(1);
  }
}

main(); 