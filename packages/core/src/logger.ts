import type { Logger } from './types';

/** A horizontal rule used to frame pipeline output. */
export const line = '─'.repeat(60);

/** The default logger: writes to the console. */
export function createConsoleLogger(): Logger {
  return {
    info(message: string): void {
      console.log(message);
    },
    warn(message: string): void {
      console.warn(message);
    },
    error(message: string): void {
      console.error(message);
    },
  };
}
