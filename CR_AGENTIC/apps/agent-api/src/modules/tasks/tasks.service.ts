import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { prisma } from '@cr-agentic/database';
import { AgentPlanner } from '@cr-agentic/agent-core';
import { enqueueJob } from '@cr-agentic/queue';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import { REDIS_CLIENT } from '../queue/queue.module';
import { AgentRunRequestDto } from './dto/agent-run.request.dto';

@Injectable()
export class TasksService {
  private readonly planner = new AgentPlanner();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async listTasks(userId: string, status?: string) {
    return prisma.agentTask.findMany({
      where: {
        userId,
        ...(status ? { status: status as never } : {}),
      },
      include: { taskRuns: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getTask(userId: string, taskId: string) {
    const task = await prisma.agentTask.findFirst({
      where: { id: taskId, userId },
      include: { taskRuns: { orderBy: { createdAt: 'desc' } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async runAgent(userId: string, dto: AgentRunRequestDto) {
    const account = await prisma.connectedAccount.findFirst({
      where: { id: dto.connectedAccountId, userId },
    });
    if (!account) throw new NotFoundException('Connected account not found');

    const planned = this.planner.plan({
      goal: 'manual_sync',
      userId,
      connectedAccountId: account.id,
    });

    const task = await prisma.agentTask.create({
      data: {
        userId,
        connectedAccountId: account.id,
        taskType: 'MANUAL_SYNC',
        status: 'QUEUED',
        plan: planned as object,
        idempotencyKey: `manual-sync:${account.id}:${Date.now()}`,
      },
    });

    const taskRun = await prisma.taskRun.create({
      data: { agentTaskId: task.id, status: 'PENDING' },
    });

    await enqueueJob(QUEUE_NAMES.LMS_CHECK, this.redis, 'check', {
      connectedAccountId: account.id,
      userId,
      taskId: task.id,
      taskRunId: taskRun.id,
    });

    return { taskId: task.id, taskRunId: taskRun.id };
  }
}
