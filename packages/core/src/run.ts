import { ScriptPipeError } from './errors';
import { createConsoleLogger, line } from './logger';
import type {
  Pipeline,
  ResolvedAsset,
  RunOptions,
  RunResult,
  StepContext,
  StepResult,
} from './types';

/**
 * Run a pipeline's steps in their derived order.
 *
 * Each step's `run` receives a {@link StepContext} with the resolved locations of exactly
 * the assets it declared. Steps run sequentially; if a step throws, the error propagates —
 * ScriptPipe does not swallow failures.
 */
export async function runPipeline(
  pipeline: Pipeline,
  options: RunOptions = {},
): Promise<RunResult> {
  const logger = options.logger ?? createConsoleLogger();

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
    const ctx: StepContext = {
      pipeline: pipeline.name,
      step: stepName,
      reads: resolveAssets(pipeline, step.reads),
      writes: resolveAssets(pipeline, step.writes),
      logger,
    };

    logger.info(`→ ${stepName}`);
    const start = Date.now();
    const result = await step.run(ctx);
    const ms = Date.now() - start;
    logger.info(`  done (${ms}ms)`);
    results.push({ step: stepName, result, ms });
  }

  logger.info(line);
  logger.info(`Completed ${results.length} step(s).`);
  logger.info(line);

  return { pipeline: pipeline.name, steps: results };
}

/** Resolve a step's declared asset names to their locations. */
function resolveAssets(
  pipeline: Pipeline,
  names: string[],
): Record<string, ResolvedAsset> {
  const resolved: Record<string, ResolvedAsset> = {};
  for (const name of names) {
    const asset = pipeline.assets[name]!;
    resolved[name] = { name, layer: asset.layer, uri: asset.uri };
  }
  return resolved;
}
