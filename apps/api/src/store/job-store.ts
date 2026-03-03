import { EventEmitter } from 'node:events';
import type { ExtractionJob, SseEventName, VideoItem } from '@ypt/shared';
import { NotFoundError } from '../errors';

type JobEvent = {
  event: SseEventName;
  data: unknown;
};

type CreateJobArgs = {
  playlistId: string;
  playlistTitle: string;
  totalTarget: number;
};

export class JobStore {
  private readonly jobs = new Map<string, ExtractionJob>();

  private readonly events = new EventEmitter();

  private readonly ttlMs: number;

  private cleanupTimer: NodeJS.Timeout | null = null;

  public constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
    this.startCleanup();
  }

  public createJob(args: CreateJobArgs): ExtractionJob {
    const now = Date.now();
    const job: ExtractionJob = {
      jobId: crypto.randomUUID(),
      playlistId: args.playlistId,
      playlistTitle: args.playlistTitle,
      status: 'queued',
      processed: 0,
      totalTarget: args.totalTarget,
      items: [],
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString()
    };

    this.jobs.set(job.jobId, job);
    return job;
  }

  public getJob(jobId: string): ExtractionJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundError('Job not found or expired.');
    }

    return job;
  }

  public getJobSummary(jobId: string): Omit<ExtractionJob, 'items'> {
    const job = this.getJob(jobId);
    const { items: _items, ...summary } = job;
    return summary;
  }

  public appendItems(jobId: string, items: VideoItem[]): void {
    const job = this.getJob(jobId);
    for (const item of items) {
      job.items.push(item);
      this.emit(jobId, 'video_added', { item, processed: job.items.length, totalTarget: job.totalTarget });
    }
  }

  public setStatus(jobId: string, status: ExtractionJob['status'], error?: string): void {
    const job = this.getJob(jobId);
    job.status = status;
    if (error) {
      job.error = error;
    }

    if (status === 'completed') {
      this.emit(jobId, 'job_completed', {
        processed: job.processed,
        totalTarget: job.totalTarget,
        status
      });
    }

    if (status === 'failed') {
      this.emit(jobId, 'job_failed', {
        error: job.error,
        processed: job.processed,
        totalTarget: job.totalTarget,
        status
      });
    }
  }

  public publishStart(jobId: string): void {
    const job = this.getJob(jobId);
    this.emit(jobId, 'job_started', {
      jobId,
      playlistTitle: job.playlistTitle,
      totalTarget: job.totalTarget
    });
  }

  public setProcessed(jobId: string, processed: number): void {
    const job = this.getJob(jobId);
    job.processed = processed;
    this.emit(jobId, 'progress', {
      processed,
      totalTarget: job.totalTarget,
      status: job.status
    });
  }

  public getPaginatedItems(jobId: string, page: number, pageSize: number): { items: VideoItem[]; totalItems: number; totalPages: number } {
    const job = this.getJob(jobId);
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const totalItems = job.items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;

    return {
      items: job.items.slice(start, end),
      totalItems,
      totalPages
    };
  }

  public subscribe(jobId: string, listener: (payload: JobEvent) => void): () => void {
    const channel = this.channel(jobId);
    this.events.on(channel, listener);
    return () => this.events.off(channel, listener);
  }

  public stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [jobId, job] of this.jobs.entries()) {
        if (new Date(job.expiresAt).getTime() < now) {
          this.jobs.delete(jobId);
        }
      }
    }, 60_000);
  }

  private emit(jobId: string, event: SseEventName, data: unknown): void {
    this.events.emit(this.channel(jobId), { event, data } satisfies JobEvent);
  }

  private channel(jobId: string): string {
    return `job:${jobId}`;
  }
}
