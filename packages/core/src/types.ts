import type { Storage } from './storage';

/**
 * The pipeline layers ScriptPipe understands. They describe where an asset sits in the
 * flow from external inputs (`source`) to published outputs (`gold`). `gold` is the
 * terminal layer: delivering those outputs to their final destination is the consuming
 * app's responsibility, not ScriptPipe's.
 */
export type Layer = 'source' | 'bronze' | 'silver' | 'gold';

/** All valid layers, in flow order. */
export const LAYERS: readonly Layer[] = ['source', 'bronze', 'silver', 'gold'];

/**
 * A named input or output. The storage backend is not ScriptPipe's concern — an asset is
 * just a name, a layer, and a location (`uri`).
 *
 * When `entries` is true the asset is a **collection**: `uri` names a directory and each item
 * lives at `<uri>/<key>.json`. Partitioned steps write collections; downstream steps read them
 * back with `ctx.readAll` / `ctx.list`.
 */
export interface Asset {
  layer: Layer;
  uri: string;
  description?: string;
  entries?: boolean;
}

/** An asset as handed to a step at run time: its declared name plus resolved location. */
export interface ResolvedAsset {
  name: string;
  layer: Layer;
  uri: string;
  entries?: boolean;
}

/** Minimal logging surface. Injectable so hosts can route output however they like. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Scoped IO handed to a step. Every method takes an asset **name** the step declared (in its
 * `reads` for the read methods, its `writes` for the write methods) — reaching for an
 * undeclared asset throws. IO is routed through the run's {@link Storage}, so steps never
 * hard-code paths or import `node:fs`.
 */
export interface StepIO {
  /** Read and JSON-parse a single-file asset. */
  read<T = unknown>(asset: string): Promise<T>;
  /** Read a single-file asset as UTF-8 text. */
  readText(asset: string): Promise<string>;
  /** Write a value as JSON to a single-file asset. */
  write(asset: string, value: unknown): Promise<void>;
  /** Write a value as JSON to one item of a collection asset (`<uri>/<key>.json`). */
  write(asset: string, key: string, value: unknown): Promise<void>;
  /** Whether a single-file asset — or one `key` of a collection asset — exists. */
  exists(asset: string, key?: string): Promise<boolean>;
  /** The keys currently present in a collection asset. */
  list(asset: string): Promise<string[]>;
  /** Read and JSON-parse every item of a collection asset. */
  readAll<T = unknown>(asset: string): Promise<T[]>;
}

/**
 * What a step's `run` function receives. `reads` and `writes` are keyed by asset name and
 * contain only the assets the step declared; the {@link StepIO} methods read and write them
 * through the run's storage.
 */
export interface StepContext extends StepIO {
  pipeline: string;
  step: string;
  reads: Record<string, ResolvedAsset>;
  writes: Record<string, ResolvedAsset>;
  logger: Logger;
}

/** Fields shared by every step shape. `kind` is an optional documentation label only. */
export interface StepBase {
  kind?: string;
  reads: string[];
  writes: string[];
}

/**
 * A step that runs once over its declared assets. `reads`/`writes` declare the graph; `run`
 * does the work.
 */
export interface SimpleStep extends StepBase {
  partition?: undefined;
  run: (ctx: StepContext) => unknown | Promise<unknown>;
}

/**
 * A step that fans out: `partition` yields the items, `key` names each item's output, and
 * `run` is invoked once per item — up to `concurrency` at a time (default 1, i.e. sequential).
 * Whatever `run` returns is written to the step's collection asset at `key(item)`; return
 * `undefined` to opt out and do your own IO via `ctx.write`.
 */
export interface PartitionedStep<Item = unknown> extends StepBase {
  partition: (ctx: StepContext) => Item[] | Promise<Item[]>;
  key: (item: Item) => string;
  concurrency?: number;
  run: (item: Item, ctx: StepContext) => unknown | Promise<unknown>;
}

/**
 * A step is either a plain {@link SimpleStep} or a fan-out {@link PartitionedStep}. Both are
 * discriminated by the presence of `partition`.
 */
export type Step = SimpleStep | PartitionedStep;

/** The shape passed to {@link definePipeline}. */
export interface PipelineConfig {
  assets: Record<string, Asset>;
  steps: Record<string, Step>;
}

/** A validated pipeline with its execution order already derived. */
export interface Pipeline {
  name: string;
  assets: Record<string, Asset>;
  steps: Record<string, Step>;
  /** Step names in topological execution order. */
  order: string[];
}

/** The outcome of running a single step. */
export interface StepResult {
  step: string;
  result: unknown;
  ms: number;
  /** For a partitioned step: how many items it fanned out over. */
  items?: number;
}

/** Options for {@link runPipeline}. */
export interface RunOptions {
  /** Restrict execution to these step names (still run in derived order). */
  only?: string[];
  /** Override the default console logger. */
  logger?: Logger;
  /** Override the default filesystem storage backend. */
  storage?: Storage;
}

/** The outcome of running a pipeline. */
export interface RunResult {
  pipeline: string;
  steps: StepResult[];
}
