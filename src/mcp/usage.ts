export type StagehandUsageOperation = string;

export type StagehandUsageKey = {
  sessionId: string;
  toolName: string;
  operation: StagehandUsageOperation;
};

export type StagehandOperationStats = {
  callCount: number;
  toolCallCounts: Record<string, number>;
};

export type StagehandSessionUsage = {
  operations: Record<StagehandUsageOperation, StagehandOperationStats>;
};

export type StagehandUsageSnapshot = {
  global: Record<StagehandUsageOperation, StagehandOperationStats>;
  perSession: Record<string, StagehandSessionUsage>;
};

const globalUsage: Record<string, StagehandOperationStats> = {};
const perSessionUsage: Record<string, StagehandSessionUsage> = {};

function getOrCreateOperationStats(
  container: Record<StagehandUsageOperation, StagehandOperationStats>,
  operation: StagehandUsageOperation,
): StagehandOperationStats {
  if (!container[operation]) {
    container[operation] = {
      callCount: 0,
      toolCallCounts: {},
    };
  }
  return container[operation];
}

export function recordStagehandCall({
  sessionId,
  toolName,
  operation,
}: StagehandUsageKey): void {
  // Update global aggregate
  const globalStats = getOrCreateOperationStats(globalUsage, operation);
  globalStats.callCount += 1;
  globalStats.toolCallCounts[toolName] =
    (globalStats.toolCallCounts[toolName] ?? 0) + 1;

  // Update per-session usage
  if (!perSessionUsage[sessionId]) {
    perSessionUsage[sessionId] = { operations: {} };
  }

  const sessionStats = getOrCreateOperationStats(
    perSessionUsage[sessionId].operations,
    operation,
  );
  sessionStats.callCount += 1;
  sessionStats.toolCallCounts[toolName] =
    (sessionStats.toolCallCounts[toolName] ?? 0) + 1;
}

export function getUsageSnapshot(): StagehandUsageSnapshot {
  return {
    global: globalUsage,
    perSession: perSessionUsage,
  };
}

export function resetUsage(): void {
  for (const key of Object.keys(globalUsage)) {
     
    delete globalUsage[key];
  }
  for (const key of Object.keys(perSessionUsage)) {
     
    delete perSessionUsage[key];
  }
}
