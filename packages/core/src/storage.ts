import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

/**
 * The IO seam the engine talks to. A `uri` is an opaque location string — for the default
 * {@link createFsStorage} it is a filesystem path, but an adapter is free to interpret it
 * however it likes (an S3 key, a database row id, …). Methods may be synchronous or async;
 * the engine always `await`s them, so an async backend just returns promises.
 *
 * Keeping IO behind this interface is what lets the engine name per-item outputs, enumerate a
 * collection, and (in a later release) resume or clean — without hard-coding `node:fs`.
 */
export interface Storage {
  /** Read a location as UTF-8 text. */
  readText(uri: string): string | Promise<string>;
  /** Write UTF-8 text to a location, creating any parent containers as needed. */
  writeText(uri: string, contents: string): void | Promise<void>;
  /** Whether a location (file or directory) exists. */
  exists(uri: string): boolean | Promise<boolean>;
  /** The entry names directly under a directory location. Order is not guaranteed. */
  list(uri: string): string[] | Promise<string[]>;
  /** Remove a location and, if it is a directory, everything under it. A no-op if absent. */
  remove(uri: string): void | Promise<void>;
}

function assertUri(uri: string): string {
  if (typeof uri !== 'string' || uri === '') {
    throw new Error('Storage location must be a non-empty uri.');
  }
  return uri;
}

/**
 * The default {@link Storage}: reads and writes the local filesystem. `uri`s are treated as
 * paths; writes create parent directories; `remove` is recursive. This is what a pipeline
 * uses unless a host injects its own adapter via `runPipeline(pipeline, { storage })`.
 */
export function createFsStorage(): Storage {
  return {
    readText(uri: string): string {
      return readFileSync(assertUri(uri), 'utf8');
    },
    writeText(uri: string, contents: string): void {
      const path = assertUri(uri);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    },
    exists(uri: string): boolean {
      return existsSync(assertUri(uri));
    },
    list(uri: string): string[] {
      return readdirSync(assertUri(uri));
    },
    remove(uri: string): void {
      rmSync(assertUri(uri), { recursive: true, force: true });
    },
  };
}
