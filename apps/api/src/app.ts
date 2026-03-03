import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { config } from './config';
import { buildYouTubeClient, type YouTubeClient } from './lib/youtube';
import { registerExtractionRoutes } from './routes/extractions';
import { ExtractionService } from './services/extraction-service';
import { JobStore } from './store/job-store';

type BuildAppArgs = {
  youtubeClient?: YouTubeClient;
  jobStore?: JobStore;
  batchSize?: number;
  batchDelayMs?: number;
};

export const buildApp = async (args: BuildAppArgs = {}): Promise<FastifyInstance> => {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true
  });

  const store = args.jobStore ?? new JobStore(config.jobTtlMinutes * 60_000);
  const youtubeClient = args.youtubeClient ?? buildYouTubeClient({ apiKey: config.youtubeApiKey });
  const extractionService = new ExtractionService(
    youtubeClient,
    store,
    args.batchSize ?? config.batchSize,
    args.batchDelayMs ?? config.batchDelayMs
  );

  registerExtractionRoutes(app, {
    store,
    extractionService,
    youtubeClient
  });

  app.addHook('onClose', async () => {
    store.stopCleanup();
  });

  return app;
};
