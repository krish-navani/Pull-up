/**
 * Logger utility for development and production
 * Only logs in development mode
 */
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  error: (...args: any[]) => {
    // Always log errors
    console.error(...args);
  },
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
};
