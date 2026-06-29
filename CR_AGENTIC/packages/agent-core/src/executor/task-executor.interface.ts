export interface TaskExecutionResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

export interface TaskExecutor {
  execute(
    taskType: string,
    payload: Record<string, unknown>,
    taskRunId: string,
  ): Promise<TaskExecutionResult>;
}
