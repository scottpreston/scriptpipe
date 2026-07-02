import type { PartitionedStep, StepContext } from './types';

/** The authoring shape for {@link partitioned}, generic over the item type. */
export interface PartitionedStepInit<Item> {
  kind?: string;
  reads: string[];
  writes: string[];
  partition: (ctx: StepContext) => Item[] | Promise<Item[]>;
  key: (item: Item) => string;
  concurrency?: number;
  run: (item: Item, ctx: StepContext) => unknown | Promise<unknown>;
}

/**
 * Author a fan-out step with full type inference. `Item` is inferred from `partition`'s return,
 * so `key` and `run` see the real item type instead of `unknown`:
 *
 * ```ts
 * generateTypes: partitioned({
 *   reads: ['toolGraph'],
 *   writes: ['toolTypes'],                 // a collection asset (entries: true)
 *   partition: (ctx) => ctx.read<Graph>('toolGraph').then((g) => g.nodes),
 *   key: (node) => node.id,                // node is typed
 *   concurrency: 4,
 *   run: (node, ctx) => buildToolType(node),
 * })
 * ```
 *
 * Equivalent to writing the object literal directly, but the literal would force `Item` to
 * `unknown` under `strict` type-checking. The returned step drops straight into a pipeline's
 * `steps` map.
 */
export function partitioned<Item>(
  init: PartitionedStepInit<Item>,
): PartitionedStep {
  return init as unknown as PartitionedStep;
}
