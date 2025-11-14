import type { Stagehand } from "@browserbasehq/stagehand";

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

async function logStagehandMetrics(
  stagehand: Stagehand | undefined,
  key: StagehandUsageKey,
): Promise<void> {
  if (!stagehand) return;

   
  const rawMetrics: any = (stagehand as any).metrics;
  const metrics =
    rawMetrics && typeof rawMetrics.then === "function"
      ? await rawMetrics
      : rawMetrics;

  if (!metrics) return;

  // Keep this as a structured JSON line so it’s easy to grep/pipe elsewhere.
   
  console.log(
    JSON.stringify(
      {
        source: "stagehand-mcp",
        event: "stagehand_metrics",
        ...key,
        metrics,
      },
      null,
      2,
    ),
  );
}

export async function recordStagehandCall(
  args: StagehandUsageKey & { stagehand?: Stagehand },
): Promise<void> {
  const { sessionId, toolName, operation, stagehand } = args;

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

  await logStagehandMetrics(stagehand, { sessionId, toolName, operation });
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
