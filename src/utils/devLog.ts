/**
 * Development-only logging utility
 * Logs only in development mode, not in production builds
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Logs a message only in development mode
 * @param args Arguments to pass to console.log
 */
export function devLog(...args: any[]): void {
  if (isDevelopment) {
    console.log(...args);
  }
}

/**
 * Logs a warning only in development mode
 * @param args Arguments to pass to console.warn
 */
export function devWarn(...args: any[]): void {
  if (isDevelopment) {
    console.warn(...args);
  }
}

/**
 * Logs an error (always logs, even in production)
 * @param args Arguments to pass to console.error
 */
export function devError(...args: any[]): void {
  // Errors should always be logged
  console.error(...args);
}
