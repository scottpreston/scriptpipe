import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ResolvedAsset } from './types';

/**
 * A filesystem target: either a path string or a resolved asset (anything with a `uri`).
 * Steps can pass `ctx.reads.myAsset` / `ctx.writes.myAsset` directly.
 */
export type FsTarget = string | Pick<ResolvedAsset, 'uri'>;

function toPath(target: FsTarget): string {
  const uri = typeof target === 'string' ? target : target.uri;
  if (typeof uri !== 'string' || uri === '') {
    throw new Error('Filesystem target must have a non-empty uri.');
  }
  return uri;
}

/** Read a UTF-8 text file. */
export function readText(target: FsTarget): string {
  return readFileSync(toPath(target), 'utf8');
}

/** Write a UTF-8 text file, creating parent directories as needed. */
export function writeText(target: FsTarget, contents: string): void {
  const path = toPath(target);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

/** Read and parse a JSON file. */
export function readJson<T>(target: FsTarget): T {
  return JSON.parse(readText(target)) as T;
}

/** Write a value as pretty-printed JSON with a trailing newline. */
export function writeJson(target: FsTarget, value: unknown): void {
  writeText(target, `${JSON.stringify(value, null, 2)}\n`);
}
