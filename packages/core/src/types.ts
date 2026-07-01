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
 */
export interface Asset {
  layer: Layer;
  uri: string;
  description?: string;
}

/** An asset as handed to a step at run time: its declared name plus resolved location. */
export interface ResolvedAsset {
  name: string;
  layer: Layer;
  uri: string;
}

/** Minimal logging surface. Injectable so hosts can route output however they like. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * What a step's `run` function receives. `reads` and `writes` are keyed by asset name and
 * contain only the assets the step declared — the step does its own IO against those uris.
 */
export interface StepContext {
  pipeline: string;
  step: string;
  reads: Record<string, ResolvedAsset>;
  writes: Record<string, ResolvedAsset>;
  logger: Logger;
}

/**
 * A step is a self-contained script that reads assets and writes assets. `reads`/`writes`
 * declare the graph; `run` does the work. `kind` is an optional documentation label only —
 * every step runs the same way.
 */
export interface Step {
  kind?: string;
  reads: string[];
  writes: string[];
  run: (ctx: StepContext) => unknown | Promise<unknown>;
}

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
}

/** Options for {@link runPipeline}. */
export interface RunOptions {
  /** Restrict execution to these step names (still run in derived order). */
  only?: string[];
  /** Override the default console logger. */
  logger?: Logger;
}

/** The outcome of running a pipeline. */
export interface RunResult {
  pipeline: string;
  steps: StepResult[];
}
