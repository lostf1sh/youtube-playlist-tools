import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ExtractionCreateResponse, ExtractionRequest, LargePlaylistChoice, VideosPageResponse } from '@ypt/shared';
import { BadRequestError, ConflictError } from '../errors';
import { parsePlaylistId } from '../lib/playlist';
import { toCsv } from '../lib/csv';
import { resolveTargetCount, type ExtractionService } from '../services/extraction-service';
import type { JobStore } from '../store/job-store';
import type { YouTubeClient } from '../lib/youtube';

type RegisterArgs = {
  store: JobStore;
  extractionService: ExtractionService;
  youtubeClient: YouTubeClient;
};

const validModes = new Set(['realtime', 'paginated']);
const validLargeChoices = new Set(['first500', 'first1000', 'all']);

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const isLargeChoice = (value: unknown): value is LargePlaylistChoice => {
  return typeof value === 'string' && validLargeChoices.has(value);
};

const handleError = (reply: FastifyReply, error: unknown): FastifyReply => {
  if (error instanceof ConflictError) {
    return reply.status(error.statusCode).send({ message: error.message, ...error.details });
  }

  if (error instanceof Error && 'statusCode' in error) {
    const statusCode = Number((error as { statusCode: number }).statusCode);
    return reply.status(statusCode).send({ message: error.message });
  }

  return reply.status(500).send({ message: 'Beklenmeyen sunucu hatası.' });
};

export const registerExtractionRoutes = (app: FastifyInstance, args: RegisterArgs): void => {
  app.post('/api/extractions', async (request: FastifyRequest<{ Body: ExtractionRequest }>, reply) => {
    try {
      const { playlistUrl, mode, largePlaylistChoice } = request.body;

      if (!playlistUrl || typeof playlistUrl !== 'string') {
        throw new BadRequestError('playlistUrl zorunludur.');
      }

      if (!validModes.has(mode)) {
        throw new BadRequestError('mode değeri realtime veya paginated olmalıdır.');
      }

      const playlistId = parsePlaylistId(playlistUrl);
      if (!playlistId) {
        throw new BadRequestError('Geçerli bir YouTube playlist URL girin.');
      }

      if (largePlaylistChoice && !isLargeChoice(largePlaylistChoice)) {
        throw new BadRequestError('largePlaylistChoice geçersiz.');
      }

      const playlistMeta = await args.youtubeClient.getPlaylistMetadata(playlistId);
      if (playlistMeta.itemCount > 1000 && !largePlaylistChoice) {
        throw new ConflictError('Büyük playlist için seçim gerekli.', {
          code: 'LARGE_PLAYLIST_CHOICE_REQUIRED',
          itemCount: playlistMeta.itemCount,
          options: ['first500', 'first1000', 'all']
        });
      }

      const maxItems = resolveTargetCount(playlistMeta.itemCount, largePlaylistChoice);

      const job = args.store.createJob({
        playlistId,
        playlistTitle: playlistMeta.playlistTitle,
        totalTarget: maxItems
      });

      args.extractionService.startJob({
        jobId: job.jobId,
        playlistId,
        maxItems
      });

      const response: ExtractionCreateResponse = {
        jobId: job.jobId,
        playlistId,
        playlistTitle: playlistMeta.playlistTitle,
        itemCount: playlistMeta.itemCount,
        status: 'queued'
      };

      return reply.status(201).send(response);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.get('/api/extractions/:jobId', async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
    try {
      const summary = args.store.getJobSummary(request.params.jobId);
      return reply.send(summary);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.get('/api/extractions/:jobId/videos', async (request: FastifyRequest<{ Params: { jobId: string }; Querystring: { page?: string; pageSize?: string } }>, reply) => {
    try {
      const page = parsePositiveInt(request.query.page, 1);
      const pageSize = parsePositiveInt(request.query.pageSize, 25);
      const pageData = args.store.getPaginatedItems(request.params.jobId, page, pageSize);

      const response: VideosPageResponse = {
        items: pageData.items,
        pagination: {
          page,
          pageSize,
          totalItems: pageData.totalItems,
          totalPages: pageData.totalPages
        }
      };

      return reply.send(response);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.get('/api/extractions/:jobId/export.csv', async (request: FastifyRequest<{ Params: { jobId: string }; Querystring: { columns?: string } }>, reply) => {
    try {
      const summary = args.store.getJob(request.params.jobId);
      const columns = (request.query.columns ?? '')
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean);

      const csv = toCsv(summary.items, columns);
      const fileName = `${summary.playlistTitle.replaceAll(/[^a-zA-Z0-9-_]/g, '_') || 'playlist'}.csv`;

      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename=\"${fileName}\"`);
      return reply.send(csv);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.get('/api/extractions/:jobId/events', async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
    const { jobId } = request.params;

    try {
      const job = args.store.getJob(jobId);
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      });

      const send = (event: string, data: unknown): void => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      send('progress', {
        status: job.status,
        processed: job.processed,
        totalTarget: job.totalTarget
      });

      if (job.status === 'completed') {
        send('job_completed', {
          status: job.status,
          processed: job.processed,
          totalTarget: job.totalTarget
        });
        reply.raw.end();
        return;
      }

      if (job.status === 'failed') {
        send('job_failed', {
          status: job.status,
          error: job.error,
          processed: job.processed,
          totalTarget: job.totalTarget
        });
        reply.raw.end();
        return;
      }

      const heartbeat = setInterval(() => {
        reply.raw.write(': heartbeat\n\n');
      }, 20_000);

      const unsubscribe = args.store.subscribe(jobId, (payload) => {
        send(payload.event, payload.data);
        if (payload.event === 'job_completed' || payload.event === 'job_failed') {
          clearInterval(heartbeat);
          unsubscribe();
          reply.raw.end();
        }
      });

      request.raw.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error) {
      return handleError(reply, error);
    }
  });
};
