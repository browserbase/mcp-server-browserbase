import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { LogLine } from "@browserbasehq/stagehand";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

// Get the directory name for the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure logging
const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, `stagehand-${new Date().toISOString().split('T')[0]}.log`);
const MAX_LOG_FILES = 10; // Maximum number of log files to keep
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB max log file size

// Queue for batching log writes
let logQueue: string[] = [];
let logWriteTimeout: NodeJS.Timeout | null = null;
const LOG_FLUSH_INTERVAL = 1000; // Flush logs every second
const MAX_OPERATION_LOGS = 1000; // Prevent operation logs from growing too large

// Operation logs stored in memory
export const operationLogs: string[] = [];
export const consoleLogs: string[] = [];

// Reference to server instance for logging
let serverInstance: Server | undefined;

// Set server for logging
export function setServerInstance(server: Server) {
  serverInstance = server;
}

// Get server instance for notifications and logging
export function getServerInstance() {
  return serverInstance;
}

// Ensure log directory exists
export function ensureLogDirectory() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// Setup log rotation management
export function setupLogRotation() {
  try {
    // Check if current log file exceeds max size
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const rotatedLogFile = path.join(LOG_DIR, `stagehand-${timestamp}.log`);
      fs.renameSync(LOG_FILE, rotatedLogFile);
    }
    
    // Clean up old log files if we have too many
    const logFiles = fs.readdirSync(LOG_DIR)
      .filter(file => file.startsWith('stagehand-') && file.endsWith('.log'))
      .map(file => path.join(LOG_DIR, file))
      .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
    
    if (logFiles.length > MAX_LOG_FILES) {
      logFiles.slice(MAX_LOG_FILES).forEach(file => {
        try {
          fs.unlinkSync(file);
        } catch (err) {
          console.error(`Failed to delete old log file ${file}:`, err);
        }
      });
    }
  } catch (err) {
    console.error('Error in log rotation:', err);
  }
}

// Flush logs to disk asynchronously
export async function flushLogs() {
  if (logQueue.length === 0) return;
  
  const logsToWrite = logQueue.join('\n') + '\n';
  logQueue = [];
  logWriteTimeout = null;
  
  try {
    await fs.promises.appendFile(LOG_FILE, logsToWrite);
    
    // Check if we need to rotate logs after write
    const stats = await fs.promises.stat(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      setupLogRotation();
    }
  } catch (err) {
    console.error('Failed to write logs to file:', err);
    // If write fails, try to use sync version as fallback
    try {
      fs.appendFileSync(LOG_FILE, logsToWrite);
    } catch (syncErr) {
      console.error('Failed to write logs synchronously:', syncErr);
    }
  }
}

// Helper function to convert LogLine to string
export function logLineToString(logLine: LogLine): string {
  const timestamp = logLine.timestamp ? new Date(logLine.timestamp).toISOString() : new Date().toISOString();
  const level = logLine.level !== undefined ? 
    (logLine.level === 0 ? 'DEBUG' : 
     logLine.level === 1 ? 'INFO' : 
     logLine.level === 2 ? 'ERROR' : 'UNKNOWN') : 'UNKNOWN';
  return `[${timestamp}] [${level}] ${logLine.message || ''}`;
}

// Main logging function
export function log(message: string, level: 'info' | 'error' | 'debug' = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  // Manage operation logs with size limit
  operationLogs.push(logMessage);
  if (operationLogs.length > MAX_OPERATION_LOGS) {
    // Keep most recent logs but trim the middle to maintain context
    const half = Math.floor(MAX_OPERATION_LOGS / 2);
    // Keep first 100 and last (MAX_OPERATION_LOGS - 100) logs
    const firstLogs = operationLogs.slice(0, 100);
    const lastLogs = operationLogs.slice(operationLogs.length - (MAX_OPERATION_LOGS - 100));
    operationLogs.length = 0;
    operationLogs.push(...firstLogs);
    operationLogs.push(`[...${operationLogs.length - MAX_OPERATION_LOGS} logs truncated...]`);
    operationLogs.push(...lastLogs);
  }
  
  // Queue log for async writing
  logQueue.push(logMessage);
  
  // Setup timer to flush logs if not already scheduled
  if (!logWriteTimeout) {
    logWriteTimeout = setTimeout(flushLogs, LOG_FLUSH_INTERVAL);
  }
  
  // Console output to stderr for debugging
  if (process.env.DEBUG || level === 'error') {
    console.error(logMessage);
  }
  
  // Send logging message to client for important events
  if (serverInstance && (level === 'info' || level === 'error')) {
    serverInstance.sendLoggingMessage({
      level: level,
      data: message,
    });
  }
}

// Format logs for response
export function formatLogResponse(logs: string[]): string {
  if (logs.length <= 100) {
    return logs.join("\n");
  }
  
  // For very long logs, include first and last parts with truncation notice
  const first = logs.slice(0, 50);
  const last = logs.slice(-50);
  return [
    ...first,
    `\n... ${logs.length - 100} more log entries (truncated) ...\n`,
    ...last
  ].join("\n");
}

// Log request
export function logRequest(type: string, params: any) {
  const requestLog = {
    timestamp: new Date().toISOString(),
    type,
    params,
  };
  log(`REQUEST: ${JSON.stringify(requestLog, null, 2)}`, 'debug');
}

// Log response
export function logResponse(type: string, response: any) {
  const responseLog = {
    timestamp: new Date().toISOString(),
    type,
    response,
  };
  log(`RESPONSE: ${JSON.stringify(responseLog, null, 2)}`, 'debug');
}

// Register handlers for process exit
export function registerExitHandlers() {
  // Make sure logs are flushed when the process exits
  process.on('exit', () => {
    if (logQueue.length > 0) {
      try {
        fs.appendFileSync(LOG_FILE, logQueue.join('\n') + '\n');
      } catch (err) {
        console.error('Failed to flush logs on exit:', err);
      }
    }
  });

  process.on('SIGINT', () => {
    // Flush logs and exit
    if (logQueue.length > 0) {
      try {
        fs.appendFileSync(LOG_FILE, logQueue.join('\n') + '\n');
      } catch (err) {
        console.error('Failed to flush logs on SIGINT:', err);
      }
    }
    process.exit(0);
  });
}

// Schedule periodic log rotation
export function scheduleLogRotation() {
  // Add log rotation check periodically
  setInterval(() => {
    setupLogRotation();
  }, 15 * 60 * 1000); // Check every 15 minutes
} 