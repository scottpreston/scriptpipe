import { CycleError } from './errors';
import type { PipelineConfig } from './types';

/**
 * Derive a topological execution order from step reads/writes.
 *
 * Step A depends on step B when A reads an asset that B writes. Assets with no producing
 * step are treated as external inputs and create no dependency. Ready steps are drained in
 * declaration order so the output is stable across runs.
 *
 * @throws {CycleError} if the steps form a dependency cycle.
 */
export function deriveOrder(config: PipelineConfig): string[] {
  const { steps } = config;
  const stepNames = Object.keys(steps);

  const dependenciesOf = buildDependencies(config);

  const dependents = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const name of stepNames) {
    dependents.set(name, new Set());
    indegree.set(name, 0);
  }
  for (const name of stepNames) {
    const deps = dependenciesOf.get(name);
    if (deps === undefined) continue;
    for (const dep of deps) {
      dependents.get(dep)!.add(name);
      indegree.set(name, indegree.get(name)! + 1);
    }
  }

  const order: string[] = [];
  const ready = stepNames.filter((name) => indegree.get(name) === 0);
  while (ready.length > 0) {
    const name = ready.shift()!;
    order.push(name);
    for (const dependent of dependents.get(name)!) {
      const next = indegree.get(dependent)! - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
      }
    }
  }

  if (order.length !== stepNames.length) {
    throw new CycleError(findCycle(dependenciesOf));
  }
  return order;
}

/** Map each step to the set of steps it depends on (producers of the assets it reads). */
function buildDependencies(config: PipelineConfig): Map<string, Set<string>> {
  const { steps } = config;

  const producerOf = new Map<string, string>();
  for (const [stepName, step] of Object.entries(steps)) {
    for (const asset of step.writes) {
      producerOf.set(asset, stepName);
    }
  }

  const dependenciesOf = new Map<string, Set<string>>();
  for (const [stepName, step] of Object.entries(steps)) {
    const deps = new Set<string>();
    for (const asset of step.reads) {
      const producer = producerOf.get(asset);
      if (producer !== undefined && producer !== stepName) {
        deps.add(producer);
      }
    }
    dependenciesOf.set(stepName, deps);
  }
  return dependenciesOf;
}

/** Find one cycle via DFS, returning the step names in cycle order. */
function findCycle(dependenciesOf: Map<string, Set<string>>): string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  for (const name of dependenciesOf.keys()) {
    color.set(name, WHITE);
  }
  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);
    for (const dep of dependenciesOf.get(node)!) {
      if (color.get(dep) === GRAY) {
        const start = stack.indexOf(dep);
        return [...stack.slice(start), dep];
      }
      if (color.get(dep) === WHITE) {
        const found = dfs(dep);
        if (found !== null) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const name of dependenciesOf.keys()) {
    if (color.get(name) === WHITE) {
      const found = dfs(name);
      if (found !== null) return found;
    }
  }

  // Unreachable: deriveOrder only calls this when a cycle exists.
  return [...dependenciesOf.keys()];
}
