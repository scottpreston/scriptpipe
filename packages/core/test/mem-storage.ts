import type { Logger, Storage } from '../src/index';

/** A silent logger for tests that don't assert on log output. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** An in-memory {@link Storage} so run tests don't touch the filesystem. */
export interface MemStorage extends Storage {
  files: Map<string, string>;
}

export function memStorage(): MemStorage {
  const files = new Map<string, string>();
  const dirPrefix = (uri: string): string => `${uri.replace(/\/+$/, '')}/`;

  return {
    files,
    readText(uri: string): string {
      const value = files.get(uri);
      if (value === undefined) {
        throw new Error(`ENOENT: no such file "${uri}".`);
      }
      return value;
    },
    writeText(uri: string, contents: string): void {
      files.set(uri, contents);
    },
    exists(uri: string): boolean {
      if (files.has(uri)) return true;
      const prefix = dirPrefix(uri);
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    },
    list(uri: string): string[] {
      const prefix = dirPrefix(uri);
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          names.add(key.slice(prefix.length).split('/')[0]!);
        }
      }
      return [...names];
    },
    remove(uri: string): void {
      files.delete(uri);
      const prefix = dirPrefix(uri);
      for (const key of [...files.keys()]) {
        if (key.startsWith(prefix)) files.delete(key);
      }
    },
  };
}
