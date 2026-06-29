import 'dotenv/config';
import { createRedisConnection, createWorker } from '@cr-agentic/queue';
import {
  QUEUE_NAMES,
  type BrowserConnectLmsJob,
  type BrowserRefreshSessionJob,
  type BrowserValidateSessionJob,
  type LmsCheckJob,
  type LmsDownloadJob,
} from '@cr-agentic/shared';
import { createLogger } from '@cr-agentic/observability';
import { BrowserProcessors } from './processors/browser-processors';

const logger = createLogger('browser-worker');

async function main() {
  const redis = createRedisConnection();
  const processors = new BrowserProcessors(redis);

  const workers = [
    createWorker<BrowserConnectLmsJob>(QUEUE_NAMES.BROWSER_CONNECT_LMS, async (job) => {
      try {
        await processors.processConnect(job);
      } catch (err) {
        await processors.handleFailure(QUEUE_NAMES.BROWSER_CONNECT_LMS, job, err);
        throw err;
      }
    }),
    createWorker<BrowserRefreshSessionJob>(QUEUE_NAMES.BROWSER_REFRESH_SESSION, async (job) => {
      try {
        await processors.processRefresh(job);
      } catch (err) {
        await processors.handleFailure(QUEUE_NAMES.BROWSER_REFRESH_SESSION, job, err);
        throw err;
      }
    }),
    createWorker<BrowserValidateSessionJob>(QUEUE_NAMES.BROWSER_VALIDATE_SESSION, async (job) => {
      try {
        await processors.processValidateSession(job);
      } catch (err) {
        await processors.handleFailure(QUEUE_NAMES.BROWSER_VALIDATE_SESSION, job, err);
        throw err;
      }
    }),
    createWorker<LmsCheckJob>(QUEUE_NAMES.LMS_CHECK, async (job) => {
      try {
        await processors.processLmsCheck(job);
      } catch (err) {
        await processors.handleFailure(QUEUE_NAMES.LMS_CHECK, job, err);
        throw err;
      }
    }),
    createWorker<LmsDownloadJob>(QUEUE_NAMES.LMS_DOWNLOAD, async (job) => {
      try {
        await processors.processDownload(job);
      } catch (err) {
        await processors.handleFailure(QUEUE_NAMES.LMS_DOWNLOAD, job, err);
        throw err;
      }
    }),
  ];

  for (const worker of workers) {
    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
    });
  }

  logger.info('Browser worker started');

  const shutdown = async () => {
    logger.info('Shutting down browser worker');
    await Promise.all(workers.map((w) => w.close()));
    await processors['stack'].controller.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Browser worker crashed');
  process.exit(1);
});
