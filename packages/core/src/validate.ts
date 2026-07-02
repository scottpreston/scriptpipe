import { ValidationError } from './errors';
import { LAYERS, type PartitionedStep, type PipelineConfig } from './types';

/**
 * Validate a pipeline definition, throwing {@link ValidationError} on the first problem.
 *
 * Checks: a non-empty name; assets/steps are objects; every asset has a valid layer and a
 * non-empty uri; every step has a run function and reads/writes arrays; every referenced
 * asset exists; no asset is written by more than one step (a single producer per asset); and
 * for a partitioned step, a key function, a positive-integer concurrency, and exactly one
 * collection (`entries: true`) write asset.
 */
export function validatePipeline(name: string, config: PipelineConfig): void {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ValidationError('Pipeline name must be a non-empty string.');
  }

  const { assets, steps } = config;
  if (assets == null || typeof assets !== 'object') {
    throw new ValidationError(`Pipeline "${name}" must declare an assets object.`);
  }
  if (steps == null || typeof steps !== 'object') {
    throw new ValidationError(`Pipeline "${name}" must declare a steps object.`);
  }

  const validLayers = new Set<string>(LAYERS);
  for (const [assetName, asset] of Object.entries(assets)) {
    if (!validLayers.has(asset.layer)) {
      throw new ValidationError(
        `Asset "${assetName}" in pipeline "${name}" has invalid layer "${asset.layer}". ` +
          `Valid layers: ${LAYERS.join(', ')}.`,
      );
    }
    if (typeof asset.uri !== 'string' || asset.uri === '') {
      throw new ValidationError(
        `Asset "${assetName}" in pipeline "${name}" must have a non-empty uri.`,
      );
    }
  }

  const producerOf = new Map<string, string>();
  for (const [stepName, step] of Object.entries(steps)) {
    if (typeof step.run !== 'function') {
      throw new ValidationError(
        `Step "${stepName}" in pipeline "${name}" must have a run function.`,
      );
    }
    if (!Array.isArray(step.reads) || !Array.isArray(step.writes)) {
      throw new ValidationError(
        `Step "${stepName}" in pipeline "${name}" must declare reads and writes arrays.`,
      );
    }

    for (const assetName of [...step.reads, ...step.writes]) {
      if (!(assetName in assets)) {
        throw new ValidationError(
          `Step "${stepName}" in pipeline "${name}" references unknown asset "${assetName}". ` +
            `Declare it in the pipeline's assets.`,
        );
      }
    }

    for (const assetName of step.writes) {
      const existing = producerOf.get(assetName);
      if (existing !== undefined) {
        throw new ValidationError(
          `Asset "${assetName}" in pipeline "${name}" is written by multiple steps ` +
            `("${existing}" and "${stepName}"). Each asset must have a single producer.`,
        );
      }
      producerOf.set(assetName, stepName);
    }

    if ('partition' in step && step.partition !== undefined) {
      validatePartitioned(name, stepName, step as PartitionedStep, assets);
    }
  }
}

/** Checks specific to a fan-out step: partition/key functions, concurrency, one collection output. */
function validatePartitioned(
  name: string,
  stepName: string,
  step: PartitionedStep,
  assets: PipelineConfig['assets'],
): void {
  if (typeof step.partition !== 'function') {
    throw new ValidationError(
      `Step "${stepName}" in pipeline "${name}" has a partition that is not a function.`,
    );
  }
  if (typeof step.key !== 'function') {
    throw new ValidationError(
      `Partitioned step "${stepName}" in pipeline "${name}" must have a key function.`,
    );
  }
  if (
    step.concurrency !== undefined &&
    (!Number.isInteger(step.concurrency) || step.concurrency < 1)
  ) {
    throw new ValidationError(
      `Partitioned step "${stepName}" in pipeline "${name}" has invalid concurrency ` +
        `${step.concurrency}; it must be a positive integer.`,
    );
  }

  const collections = step.writes.filter((assetName) => assets[assetName]?.entries);
  if (collections.length !== 1) {
    throw new ValidationError(
      `Partitioned step "${stepName}" in pipeline "${name}" must write exactly one collection ` +
        `asset (entries: true), found ${collections.length}.`,
    );
  }
}
