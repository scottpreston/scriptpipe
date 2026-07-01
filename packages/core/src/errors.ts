/** Base class for all errors thrown by ScriptPipe. */
export class ScriptPipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptPipeError';
  }
}

/** Thrown when a pipeline definition is structurally invalid. */
export class ValidationError extends ScriptPipeError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Thrown when steps form a dependency cycle and cannot be ordered. */
export class CycleError extends ScriptPipeError {
  /** The offending cycle as a list of step names (first repeated at the end). */
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Pipeline has a dependency cycle: ${cycle.join(' -> ')}`);
    this.name = 'CycleError';
    this.cycle = cycle;
  }
}
