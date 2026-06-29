import { BadRequestException } from '@nestjs/common';
import { OnboardingStage } from '@cr-agentic/database';
import { canTransitionStage, isTerminalStage } from '@cr-agentic/shared';

export function assertTransition(
  from: OnboardingStage,
  to: OnboardingStage,
): void {
  if (!canTransitionStage(from, to)) {
    throw new BadRequestException(
      `Invalid onboarding transition: ${from} -> ${to}`,
    );
  }
}

export function isTerminal(stage: OnboardingStage): boolean {
  return isTerminalStage(stage);
}
