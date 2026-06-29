import { AgentTool, ToolContext } from './tool.interface';

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  getOpenAiFunctionDefinitions(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.list().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  async execute<TInput, TOutput>(
    name: string,
    ctx: ToolContext,
    input: TInput,
  ): Promise<TOutput> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool ${name} timed out after ${tool.timeoutMs}ms`)),
        tool.timeoutMs,
      ),
    );
    return Promise.race([
      tool.handler(ctx, input) as Promise<TOutput>,
      timeout,
    ]);
  }
}
