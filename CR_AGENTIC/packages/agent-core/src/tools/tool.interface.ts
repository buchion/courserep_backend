export interface ToolContext {
  userId: string;
  taskRunId?: string;
  connectedAccountId?: string;
  documentId?: string;
}

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  timeoutMs: number;
  maxConcurrency: number;
  handler: (ctx: ToolContext, input: TInput) => Promise<TOutput>;
}

export type ToolDefinition = Pick<
  AgentTool,
  'name' | 'description' | 'inputSchema' | 'timeoutMs' | 'maxConcurrency'
>;
