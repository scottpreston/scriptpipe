import { deriveOrder } from './graph';
import { validatePipeline } from './validate';
import type { Pipeline, PipelineConfig } from './types';

/**
 * Define a pipeline from its assets and steps.
 *
 * Validation and execution-order derivation happen eagerly, so a malformed definition (an
 * unknown asset reference, a duplicate producer, a dependency cycle) throws here rather than
 * failing later at run time. The returned pipeline is frozen.
 */
export function definePipeline(name: string, config: PipelineConfig): Pipeline {
  validatePipeline(name, config);
  const order = deriveOrder(config);

  return Object.freeze({
    name,
    assets: config.assets,
    steps: config.steps,
    order,
  });
}
