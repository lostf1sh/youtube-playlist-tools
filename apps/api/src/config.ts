const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toInt(process.env.API_PORT, 8787),
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  jobTtlMinutes: toInt(process.env.JOB_TTL_MINUTES, 60),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
  batchSize: toInt(process.env.BATCH_SIZE, 50),
  batchDelayMs: toInt(process.env.BATCH_DELAY_MS, 500)
};
