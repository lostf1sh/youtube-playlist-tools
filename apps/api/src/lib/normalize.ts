import type { VideoItem } from '@ypt/shared';

export type YouTubeVideo = {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: {
      maxres?: { url?: string };
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  contentDetails?: {
    duration?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
};

const parseCount = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickThumbnail = (video: YouTubeVideo): string => {
  return (
    video.snippet?.thumbnails?.maxres?.url ??
    video.snippet?.thumbnails?.high?.url ??
    video.snippet?.thumbnails?.medium?.url ??
    video.snippet?.thumbnails?.default?.url ??
    ''
  );
};

export const normalizeYouTubeVideo = (video: YouTubeVideo): VideoItem => {
  return {
    videoId: video.id,
    title: video.snippet?.title ?? 'Untitled',
    url: `https://www.youtube.com/watch?v=${video.id}`,
    channelTitle: video.snippet?.channelTitle ?? 'Unknown channel',
    publishedAt: video.snippet?.publishedAt ?? new Date(0).toISOString(),
    duration: video.contentDetails?.duration ?? 'PT0S',
    viewCount: parseCount(video.statistics?.viewCount),
    likeCount: parseCount(video.statistics?.likeCount),
    thumbnailUrl: pickThumbnail(video)
  };
};
