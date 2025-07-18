/**
 * Default logger implementation
 * Provides consistent logging across the application
 */
export const defaultLogger = (message: string): void => {
  process.stderr.write(`${message}\n`);
};
