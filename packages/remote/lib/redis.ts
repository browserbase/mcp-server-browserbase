import { createClient, type RedisClientType } from 'redis';
import { z } from 'zod';

// Define types for our cached data
export type CachedSession = {
  currentSessionId: string;
};

export type CachedResource = {
  format: 'png' | 'jpeg';
  bytes: string;
  uri: string;
};

export type CachedResources = Record<string, CachedResource>;

export type CachedSnapshot = {
  sessionId: string;
  serializedData: string;
};

export type CachedMeta = {
  updatedAt: number;
};

export type CachedContext = {
  session?: CachedSession;
  resources?: CachedResources;
  snapshots?: CachedSnapshot[];
  meta?: CachedMeta;
};

// Zod schemas for validation
const ResourceSchema = z.object({
  format: z.enum(['png', 'jpeg']),
  bytes: z.string(),
  uri: z.string()
});

const SessionSchema = z.object({
  currentSessionId: z.string()
});

const SnapshotSchema = z.object({
  sessionId: z.string(),
  serializedData: z.string()
});

// Redis client singleton
let redisClient: RedisClientType | null = null;

// Get Redis client with connection handling
export const getRedis = async (): Promise<RedisClientType | null> => {
  try {
    if (!redisClient) {
      const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
      redisClient = createClient({ url });
      
      redisClient.on('error', (err) => {
        console.error('Redis connection error:', err);
        redisClient = null;
      });
      
      await redisClient.connect();
    }
    
    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
};

// Create context key from project ID
const getContextKey = (projectId: string): string => {
  return `mcp:ctx:${projectId}`;
};

// TTL in seconds for cached contexts
const DEFAULT_TTL = 900; // 15 minutes

// Load context data from Redis
export const loadCtx = async (projectId: string): Promise<CachedContext | null> => {
  try {
    const redis = await getRedis();
    const key = getContextKey(projectId);
    
    if (redis) {
      // Get all fields from the hash
      const hash = await redis.hGetAll(key);
      
      if (!hash || Object.keys(hash).length === 0) {
        return null;
      }
      
      const result: CachedContext = {};
      
      // Parse and validate session data
      if (hash.session) {
        try {
          const sessionData = JSON.parse(hash.session);
          result.session = SessionSchema.parse(sessionData);
        } catch (e) {
          console.warn(`Invalid session data for ${key}:`, e);
        }
      }
      
      // Parse and validate resources data
      if (hash.resources) {
        try {
          const resourcesData = JSON.parse(hash.resources);
          // Validate each resource individually
          const validResources: CachedResources = {};
          for (const [name, resource] of Object.entries(resourcesData)) {
            try {
              validResources[name] = ResourceSchema.parse(resource);
            } catch (e) {
              console.warn(`Invalid resource ${name} in ${key}:`, e);
            }
          }
          result.resources = validResources;
        } catch (e) {
          console.warn(`Invalid resources data for ${key}:`, e);
        }
      }
      
      // Parse and validate snapshots data
      if (hash.snapshots) {
        try {
          const snapshotsData = JSON.parse(hash.snapshots);
          if (Array.isArray(snapshotsData)) {
            result.snapshots = [];
            for (const snapshot of snapshotsData) {
              try {
                result.snapshots.push(SnapshotSchema.parse(snapshot));
              } catch (e) {
                console.warn(`Invalid snapshot in ${key}:`, e);
              }
            }
          }
        } catch (e) {
          console.warn(`Invalid snapshots data for ${key}:`, e);
        }
      }
      
      // Parse meta
      if (hash.meta) {
        try {
          result.meta = JSON.parse(hash.meta);
        } catch (e) {
          console.warn(`Invalid meta data for ${key}:`, e);
        }
      }
      
      return result;
    } else {
      throw new Error('Redis connection failed');
    }
  } catch (error) {
    console.error(`Error loading context for project ${projectId}:`, error);
    return null;
  }
};

// Save context data to Redis
export const saveCtx = async (
  projectId: string,
  context: Partial<CachedContext>,
  maxRetries = 3
): Promise<boolean> => {
  try {
    const redis = await getRedis();
    const key = getContextKey(projectId);
    const ttl = parseInt(process.env.REDIS_TTL_SEC || String(DEFAULT_TTL), 10);
    
    if (redis) {
      // Update with retry logic for atomicity
      let retries = 0;
      while (retries < maxRetries) {
        try {
          await redis.watch(key);
          
          // Get existing data
          const hash = await redis.hGetAll(key);
          const multi = redis.multi();
          
          // Update session if provided
          if (context.session) {
            const existingSession = hash.session ? JSON.parse(hash.session) : {};
            const mergedSession = { ...existingSession, ...context.session };
            multi.hSet(key, 'session', JSON.stringify(mergedSession));
          }
          
          // Update resources if provided
          if (context.resources) {
            const existingResources = hash.resources ? JSON.parse(hash.resources) : {};
            const mergedResources = { ...existingResources, ...context.resources };
            multi.hSet(key, 'resources', JSON.stringify(mergedResources));
          }
          
          // Update snapshots if provided
          if (context.snapshots) {
            let existingSnapshots: CachedSnapshot[] = [];
            try {
              existingSnapshots = hash.snapshots ? JSON.parse(hash.snapshots) : [];
              if (!Array.isArray(existingSnapshots)) existingSnapshots = [];
            } catch (e) {
              console.warn(`Error parsing existing snapshots for ${key}:`, e);
            }
            
            // For each new snapshot, either update existing one with same sessionId or add new
            const mergedSnapshots = [...existingSnapshots];
            for (const newSnapshot of context.snapshots) {
              const existingIndex = mergedSnapshots.findIndex(s => s.sessionId === newSnapshot.sessionId);
              if (existingIndex >= 0) {
                mergedSnapshots[existingIndex] = newSnapshot;
              } else {
                mergedSnapshots.push(newSnapshot);
              }
            }
            
            multi.hSet(key, 'snapshots', JSON.stringify(mergedSnapshots));
          }
          
          // Update metadata
          const meta = { updatedAt: Date.now() };
          multi.hSet(key, 'meta', JSON.stringify(meta));
          
          // Set expiry
          multi.expire(key, ttl);
          
          // Execute transaction
          await multi.exec();
          return true;
        } catch (err) {
          retries++;
          if (retries >= maxRetries) {
            console.error(`Failed to save context after ${maxRetries} retries:`, err);
            return false;
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      return false;
    } else {
      throw new Error('Redis connection failed');
    }
  } catch (error) {
    console.error(`Error saving context for project ${projectId}:`, error);
    return false;
  }
};

// Delete a context from cache
export const deleteCtx = async (projectId: string): Promise<boolean> => {
  try {
    const redis = await getRedis();
    const key = getContextKey(projectId);
    
    if (redis) {
      await redis.del(key);
    }
    
    return true;
  } catch (error) {
    console.error(`Error deleting context for project ${projectId}:`, error);
    return false;
  }
};
