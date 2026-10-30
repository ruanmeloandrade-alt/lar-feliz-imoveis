export interface ExecutionContext {
  rootRunId: string;
  parentRunId: string | null;
  depth: number;
  originType: string;
  originId: string | null;
}

export const MAX_EXECUTION_DEPTH = 8;

export function createChildContext(
  parentContext: ExecutionContext,
  parentRunId: string,
  originType: string,
  originId: string | null
): ExecutionContext {
  if (parentContext.depth >= MAX_EXECUTION_DEPTH) {
    throw new Error(`Maximum execution depth of ${MAX_EXECUTION_DEPTH} reached`);
  }

  return {
    rootRunId: parentContext.rootRunId,
    parentRunId: parentRunId,
    depth: parentContext.depth + 1,
    originType,
    originId,
  };
}

export function createRootContext(
  rootRunId: string,
  originType: string,
  originId: string | null
): ExecutionContext {
  return {
    rootRunId,
    parentRunId: null,
    depth: 0,
    originType,
    originId,
  };
}
