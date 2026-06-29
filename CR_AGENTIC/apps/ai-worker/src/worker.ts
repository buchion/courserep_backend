import 'dotenv/config';
import { Job } from 'bullmq';
import { loadAgentEnv } from '@cr-agentic/config';
import { createRedisConnection, createWorker, moveToDlq } from '@cr-agentic/queue';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import type { AiProcessDocumentJob, StudyPlanUpdateJob } from '@cr-agentic/shared';
import { createLogger, metrics } from '@cr-agentic/observability';
import { ToolRegistry } from '@cr-agentic/agent-core';
import { S3StorageClient } from '@cr-agentic/storage';
import { OpenAiLlmProvider } from './llm/llm-provider';
import { DocumentProcessor } from './document/document-processor';
import { registerAiTools } from './tools/ai-tools';
import { AiPipeline } from './processors/ai-pipeline';
import { CourseRepClient } from './integrations/course-rep.client';

const logger = createLogger('ai-worker');

async function main() {
  const env = loadAgentEnv();
  const redis = createRedisConnection();
  const s3 = new S3StorageClient(env);
  const llm = new OpenAiLlmProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  const docProcessor = new DocumentProcessor();
  const registry = new ToolRegistry();
  registerAiTools(registry, llm, docProcessor, s3);
  const courseRep = new CourseRepClient();
  const pipeline = new AiPipeline(registry, s3, docProcessor, courseRep);

  const workers = [
    createWorker<AiProcessDocumentJob>(
      QUEUE_NAMES.AI_PROCESS_DOCUMENT,
      async (job) => {
        metrics.increment('ai.process_document.started');
        const result = await pipeline.processDocument(
          job.data.documentId,
          job.data.userId,
          job.data.connectedAccountId,
        );
        metrics.increment('ai.process_document.completed');
        logger.info(result, 'Document processed');
      },
    ),
    createWorker<StudyPlanUpdateJob>(
      QUEUE_NAMES.STUDY_PLAN_UPDATE,
      async (job) => {
        await courseRep.recomputeStudyPlan(job.data.userId);
      },
    ),
  ];

  for (const worker of workers) {
    worker.on('failed', async (job: Job | undefined, err: Error) => {
      logger.error({ jobId: job?.id, err: err.message }, 'AI job failed');
      if (job) {
        await moveToDlq(redis, worker.name, String(job.id), job.data, err);
      }
    });
  }

  logger.info('AI worker started');

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'AI worker crashed');
  process.exit(1);
});
