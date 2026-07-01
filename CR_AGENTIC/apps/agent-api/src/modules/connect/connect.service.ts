import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { prisma } from '@cr-agentic/database';
import { AgentPlanner } from '@cr-agentic/agent-core';
import { enqueueJob } from '@cr-agentic/queue';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import { REDIS_CLIENT } from '../queue/queue.module';
import { CourseRepClient } from '../../integrations/course-rep/course-rep.client';
import { ConnectLmsRequestDto } from './dto/connect-lms.request.dto';
import { writeAuditLog } from '@cr-agentic/observability';
import { LmsType as PrismaLmsType } from '@cr-agentic/database';

@Injectable()
export class ConnectService {
  private readonly planner = new AgentPlanner();
  private readonly connectTimeoutMs = 12_000;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly courseRep: CourseRepClient,
  ) {}

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`${label} timed out after ${this.connectTimeoutMs}ms`),
          ),
        this.connectTimeoutMs,
      );
    });

    return Promise.race([promise, timeoutPromise]);
  }

  async connectLms(userId: string, dto: ConnectLmsRequestDto) {
    await this.withTimeout(this.courseRep.getUser(userId), 'course-rep user lookup');

    const account = await prisma.connectedAccount.create({
      data: {
        userId,
        lmsType: dto.lmsType as PrismaLmsType,
        lmsBaseUrl: dto.lmsBaseUrl,
        metadata: dto.metadata as object | undefined,
        status: 'PENDING',
      },
    });

    const task = await prisma.agentTask.create({
      data: {
        userId,
        connectedAccountId: account.id,
        taskType: 'CONNECT_LMS',
        status: 'QUEUED',
        idempotencyKey: `connect:${account.id}`,
        payload: { lmsType: dto.lmsType, lmsBaseUrl: dto.lmsBaseUrl },
      },
    });

    const taskRun = await prisma.taskRun.create({
      data: { agentTaskId: task.id, status: 'PENDING' },
    });

    await this.withTimeout(
      enqueueJob(
        QUEUE_NAMES.BROWSER_CONNECT_LMS,
        this.redis,
        'connect',
        {
          connectedAccountId: account.id,
          userId,
          lmsType: dto.lmsType,
          lmsBaseUrl: dto.lmsBaseUrl,
          taskId: task.id,
          taskRunId: taskRun.id,
        },
      ),
      'queue enqueue',
    );

    await writeAuditLog({
      actorId: userId,
      action: 'connect_lms',
      resourceType: 'connected_account',
      resourceId: account.id,
      metadata: { lmsType: dto.lmsType, lmsBaseUrl: dto.lmsBaseUrl },
    });

    return { connectedAccountId: account.id, taskId: task.id, status: account.status };
  }

  async listAccounts(userId: string) {
    return prisma.connectedAccount.findMany({
      where: { userId, status: { not: 'REVOKED' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reconnect(userId: string, connectedAccountId: string) {
    const account = await prisma.connectedAccount.findFirst({
      where: { id: connectedAccountId, userId },
    });
    if (!account) throw new NotFoundException('Connected account not found');

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: 'REAUTH_REQUIRED' },
    });

    const task = await prisma.agentTask.create({
      data: {
        userId,
        connectedAccountId: account.id,
        taskType: 'REFRESH_SESSION',
        status: 'QUEUED',
        idempotencyKey: `reconnect:${account.id}:${Date.now()}`,
      },
    });

    const taskRun = await prisma.taskRun.create({
      data: { agentTaskId: task.id, status: 'PENDING' },
    });

    await this.withTimeout(
      enqueueJob(
        QUEUE_NAMES.BROWSER_REFRESH_SESSION,
        this.redis,
        'refresh',
        {
          connectedAccountId: account.id,
          userId,
          taskId: task.id,
          taskRunId: taskRun.id,
        },
      ),
      'queue enqueue',
    );

    return { taskId: task.id, status: 'REAUTH_REQUIRED' };
  }

  async revoke(userId: string, connectedAccountId: string) {
    const account = await prisma.connectedAccount.findFirst({
      where: { id: connectedAccountId, userId },
    });
    if (!account) throw new NotFoundException('Connected account not found');

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: 'REVOKED' },
    });

    await prisma.browserSession.updateMany({
      where: { connectedAccountId: account.id },
      data: { status: 'REVOKED' },
    });

    await writeAuditLog({
      actorId: userId,
      action: 'revoke_lms',
      resourceType: 'connected_account',
      resourceId: account.id,
    });

    return { status: 'REVOKED' };
  }
}
