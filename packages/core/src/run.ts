import { mapWithConcurrency } from './concurrency';
import { ScriptPipeError } from './errors';
import { createConsoleLogger, line } from './logger';
import { createFsStorage } from './storage';
import type { Storage } from './storage';
import type {
  PartitionedStep,
  Pipeline,
  ResolvedAsset,
  RunOptions,
  RunResult,
  Step,
  StepContext,
  StepIO,
  StepResult,
} from './types';

/**
 * Run a pipeline's steps in their derived order.
 *
 * A plain step's `run` receives a {@link StepContext} and runs once. A partitioned step fans out:
 * its `partition` yields items, each is passed to `run` (up to `concurrency` at a time), and each
 * non-`undefined` return is written to the step's collection asset at `key(item)`. Steps run in
 * topological order; if a step throws, the error propagates — ScriptPipe does not swallow failures.
 */
export async function runPipeline(
  pipeline: Pipeline,
  options: RunOptions = {},
): Promise<RunResult> {
  const logger = options.logger ?? createConsoleLogger();
  const storage = options.storage ?? createFsStorage();

  let order = pipeline.order;
  if (options.only !== undefined) {
    const selected = new Set(options.only);
    for (const name of selected) {
      if (!(name in pipeline.steps)) {
        throw new ScriptPipeError(
          `Cannot run unknown step "${name}" in pipeline "${pipeline.name}".`,
        );
      }
    }
    order = order.filter((name) => selected.has(name));
  }

  logger.info(line);
  logger.info(`PIPELINE: ${pipeline.name}`);
  logger.info(`Steps: ${order.length > 0 ? order.join(' -> ') : '(none)'}`);
  logger.info(line);

  const results: StepResult[] = [];
  for (const stepName of order) {
    const step = pipeline.steps[stepName]!;
    const reads = resolveAssets(pipeline, step.reads);
    const writes = resolveAssets(pipeline, step.writes);
    const ctx: StepContext = {
      pipeline: pipeline.name,
      step: stepName,
      reads,
      writes,
      logger,
      ...createStepIo(reads, writes, storage),
    };

    logger.info(`→ ${stepName}`);
    const start = Date.now();
    const result = isPartitioned(step)
      ? await runPartitioned(pipeline, stepName, step, ctx, logger)
      : { result: await step.run(ctx) };
    const ms = Date.now() - start;
    logger.info(`  done (${ms}ms)`);
    results.push({ step: stepName, ms, ...result });
  }

  logger.info(line);
  logger.info(`Completed ${results.length} step(s).`);
  logger.info(line);

  return { pipeline: pipeline.name, steps: results };
}

function isPartitioned(step: Step): step is PartitionedStep {
  return typeof (step as PartitionedStep).partition === 'function';
}

/** Fan a partitioned step out over its items and persist each item's return value. */
async function runPartitioned(
  pipeline: Pipeline,
  stepName: string,
  step: PartitionedStep,
  ctx: StepContext,
  logger: { info(message: string): void },
): Promise<{ result: unknown[]; items: number }> {
  const collection = collectionWriteName(pipeline, stepName, step);

  const items = await step.partition(ctx);
  if (!Array.isArray(items)) {
    throw new ScriptPipeError(
      `Partitioned step "${stepName}" in pipeline "${pipeline.name}" must return an array from partition().`,
    );
  }

  // Resolve every key up front so a duplicate is a deterministic, pre-run failure.
  const keys = items.map((item) => {
    const key = step.key(item);
    assertKey(key, stepName, pipeline.name);
    return key;
  });
  const duplicate = firstDuplicate(keys);
  if (duplicate !== undefined) {
    throw new ScriptPipeError(
      `Partitioned step "${stepName}" in pipeline "${pipeline.name}" produced duplicate key "${duplicate}". Each item must map to a unique key.`,
    );
  }

  const concurrency = step.concurrency ?? 1;
  logger.info(
    `  fanning out ${items.length} item(s)` +
      (concurrency > 1 ? ` (concurrency ${concurrency})` : ''),
  );

  const results = await mapWithConcurrency(items, concurrency, async (item, i) => {
    const output = await step.run(item, ctx);
    if (output !== undefined) {
      await ctx.write(collection, keys[i]!, output);
    }
    return output;
  });

  return { result: results, items: items.length };
}

/** The single collection asset a partitioned step writes to (validation guarantees exactly one). */
function collectionWriteName(
  pipeline: Pipeline,
  stepName: string,
  step: PartitionedStep,
): string {
  const collections = step.writes.filter((name) => pipeline.assets[name]?.entries);
  if (collections.length !== 1) {
    throw new ScriptPipeError(
      `Partitioned step "${stepName}" in pipeline "${pipeline.name}" must write exactly one collection asset (entries: true), found ${collections.length}.`,
    );
  }
  return collections[0]!;
}

/** Resolve a step's declared asset names to their locations. */
function resolveAssets(
  pipeline: Pipeline,
  names: string[],
): Record<string, ResolvedAsset> {
  const resolved: Record<string, ResolvedAsset> = {};
  for (const name of names) {
    const asset = pipeline.assets[name]!;
    resolved[name] = {
      name,
      layer: asset.layer,
      uri: asset.uri,
      entries: asset.entries,
    };
  }
  return resolved;
}

/**
 * Build the scoped IO methods for a step. Read methods resolve against `reads`, write methods
 * against `writes`, and `exists` looks in both — reaching for an undeclared asset throws.
 */
function createStepIo(
  reads: Record<string, ResolvedAsset>,
  writes: Record<string, ResolvedAsset>,
  storage: Storage,
): StepIO {
  const readAsset = (asset: string): ResolvedAsset =>
    requireAsset(reads, asset, 'reads');
  const writeAsset = (asset: string): ResolvedAsset =>
    requireAsset(writes, asset, 'writes');

  const listKeys = async (asset: string): Promise<string[]> => {
    const a = readAsset(asset);
    requireCollection(a);
    const entries = await storage.list(a.uri);
    return entries
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => entry.slice(0, -'.json'.length));
  };

  return {
    async read<T>(asset: string): Promise<T> {
      const a = readAsset(asset);
      requireSingle(a);
      return JSON.parse(await storage.readText(a.uri)) as T;
    },
    async readText(asset: string): Promise<string> {
      const a = readAsset(asset);
      requireSingle(a);
      return storage.readText(a.uri);
    },
    write(asset: string, ...rest: unknown[]): Promise<void> {
      const a = writeAsset(asset);
      if (rest.length === 1) {
        requireSingle(a);
        return Promise.resolve(storage.writeText(a.uri, toJson(rest[0])));
      }
      if (rest.length === 2) {
        requireCollection(a);
        const key = rest[0];
        if (typeof key !== 'string') {
          throw new ScriptPipeError(
            `write("${asset}", key, value) requires a string key, got ${typeof key}.`,
          );
        }
        return Promise.resolve(storage.writeText(entryUri(a, key), toJson(rest[1])));
      }
      throw new ScriptPipeError(
        `write expects (asset, value) or (asset, key, value), got ${rest.length + 1} arguments.`,
      );
    },
    async exists(asset: string, key?: string): Promise<boolean> {
      const a = writes[asset] ?? reads[asset];
      if (a === undefined) {
        throw new ScriptPipeError(
          `Step referenced asset "${asset}", which it did not declare in reads or writes.`,
        );
      }
      if (key === undefined) {
        return storage.exists(a.uri);
      }
      requireCollection(a);
      return storage.exists(entryUri(a, key));
    },
    list: listKeys,
    async readAll<T>(asset: string): Promise<T[]> {
      const a = readAsset(asset);
      requireCollection(a);
      const keys = await listKeys(asset);
      return Promise.all(
        keys.map(async (key) => JSON.parse(await storage.readText(entryUri(a, key))) as T),
      );
    },
  };
}

function requireAsset(
  record: Record<string, ResolvedAsset>,
  asset: string,
  side: 'reads' | 'writes',
): ResolvedAsset {
  const resolved = record[asset];
  if (resolved === undefined) {
    throw new ScriptPipeError(
      `Step referenced asset "${asset}", which it did not declare in its ${side}.`,
    );
  }
  return resolved;
}

function requireCollection(asset: ResolvedAsset): void {
  if (!asset.entries) {
    throw new ScriptPipeError(
      `Asset "${asset.name}" is not a collection (entries: true); use the single-file IO methods instead.`,
    );
  }
}

function requireSingle(asset: ResolvedAsset): void {
  if (asset.entries) {
    throw new ScriptPipeError(
      `Asset "${asset.name}" is a collection (entries: true); use list/readAll or write(asset, key, value).`,
    );
  }
}

function entryUri(asset: ResolvedAsset, key: string): string {
  assertKey(key, undefined, undefined);
  const base = asset.uri.replace(/\/+$/, '');
  return `${base}/${key}.json`;
}

function assertKey(key: string, step?: string, pipeline?: string): void {
  const where = step ? ` in step "${step}"${pipeline ? ` of pipeline "${pipeline}"` : ''}` : '';
  if (typeof key !== 'string' || key === '') {
    throw new ScriptPipeError(`Partition key${where} must be a non-empty string.`);
  }
  if (key.includes('/')) {
    throw new ScriptPipeError(`Partition key "${key}"${where} must not contain "/".`);
  }
}

function firstDuplicate(keys: string[]): string | undefined {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return undefined;
}

function toJson(value: unknown): string {
  if (value === undefined) {
    throw new ScriptPipeError('Cannot write undefined as JSON.');
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}
