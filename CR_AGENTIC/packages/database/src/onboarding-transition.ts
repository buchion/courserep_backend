import { canTransitionStage } from '@cr-agentic/shared';
import { OnboardingStage, Prisma } from '@prisma/client';
import { prisma } from './index';

/**
 * Applies an onboarding stage transition from a worker context (no Nest deps),
 * validating against the shared state machine and writing an audit row in the
 * same transaction. agent-api has its own Nest-flavoured equivalent.
 */
export async function recordOnboardingTransition(
  sessionId: string,
  from: OnboardingStage,
  to: OnboardingStage,
  detail?: Record<string, unknown>,
  data: Prisma.OnboardingSessionUpdateInput = {},
): Promise<void> {
  if (!canTransitionStage(from, to)) {
    throw new Error(`Invalid onboarding transition: ${from} -> ${to}`);
  }

  await prisma.$transaction([
    prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        stage: to,
        ...(to === OnboardingStage.ONBOARDING_COMPLETE
          ? { completedAt: new Date() }
          : {}),
        ...data,
      },
    }),
    prisma.onboardingAuditEvent.create({
      data: {
        onboardingSessionId: sessionId,
        fromStage: from,
        toStage: to,
        detail: detail as Prisma.InputJsonValue | undefined,
      },
    }),
  ]);
}
