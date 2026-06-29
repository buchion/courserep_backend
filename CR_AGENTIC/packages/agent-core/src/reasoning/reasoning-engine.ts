import { ToolRegistry } from '../tools/tool-registry';
import { ToolContext } from '../tools/tool.interface';

export interface ReasoningStep {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

export interface ReasoningResult {
  steps: ReasoningStep[];
  finalObservation: string;
}

export interface LlmProvider {
  selectTool(
    observation: string,
    availableTools: ReturnType<ToolRegistry['getOpenAiFunctionDefinitions']>,
  ): Promise<{ toolName: string; input: Record<string, unknown> } | null>;
}

export class ReasoningEngine {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly llm?: LlmProvider,
  ) {}

  async run(
    ctx: ToolContext,
    initialObservation: string,
    maxSteps = 5,
  ): Promise<ReasoningResult> {
    const steps: ReasoningStep[] = [];
    let observation = initialObservation;

    for (let i = 0; i < maxSteps; i++) {
      if (!this.llm) break;

      const selection = await this.llm.selectTool(
        observation,
        this.registry.getOpenAiFunctionDefinitions(),
      );
      if (!selection) break;

      const step: ReasoningStep = {
        toolName: selection.toolName,
        input: selection.input,
      };

      try {
        step.output = await this.registry.execute(
          selection.toolName,
          ctx,
          selection.input,
        );
        observation = JSON.stringify(step.output);
      } catch (err) {
        step.error = err instanceof Error ? err.message : String(err);
        observation = step.error;
      }

      steps.push(step);
    }

    return { steps, finalObservation: observation };
  }
}
