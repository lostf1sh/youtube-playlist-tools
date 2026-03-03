import { UnauthorizedResourceError, UpstreamError } from '../errors';
import type { YouTubeVideo } from './normalize';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

type PlaylistMetadata = {
  playlistId: string;
  playlistTitle: string;
  itemCount: number;
};

export type YouTubeClient = {
  getPlaylistMetadata: (playlistId: string) => Promise<PlaylistMetadata>;
  iteratePlaylistVideoIds: (playlistId: string, maxItems: number, batchSize?: number) => AsyncGenerator<string[]>;
  getVideosByIds: (videoIds: string[]) => Promise<YouTubeVideo[]>;
};

type BuildYouTubeClientArgs = {
  apiKey: string;
  maxRetries?: number;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const makeRequest = async <T>(
  apiKey: string,
  endpoint: string,
  params: Record<string, string>,
  maxRetries: number
): Promise<T> => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    const query = new URLSearchParams({ ...params, key: apiKey });
    const response = await fetch(`${BASE_URL}/${endpoint}?${query.toString()}`);

    if (response.ok) {
      return (await response.json()) as T;
    }

    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    const message = body.error?.message ?? 'Unknown YouTube API error';

    if (response.status === 403 && message.toLowerCase().includes('private')) {
      throw new UnauthorizedResourceError('Private playlists are not supported in this version.');
    }

    if (response.status === 404) {
      throw new UpstreamError('Playlist not found.', 404);
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new UpstreamError(`YouTube API temporary error: ${message}`, 502);
      if (attempt < maxRetries) {
        const backoffMs = 300 * 2 ** attempt;
        await sleep(backoffMs);
        attempt += 1;
        continue;
      }
    }

    throw new UpstreamError(`YouTube API error: ${message}`, response.status);
  }

  throw lastError ?? new UpstreamError('YouTube API request failed.');
};

export const buildYouTubeClient = ({ apiKey, maxRetries = 3 }: BuildYouTubeClientArgs): YouTubeClient => {
  if (!apiKey) {
    throw new UpstreamError('YOUTUBE_API_KEY is missing.', 500);
  }

  return {
    async getPlaylistMetadata(playlistId: string): Promise<PlaylistMetadata> {
      const response = await makeRequest<{
        items?: Array<{ snippet?: { title?: string }; contentDetails?: { itemCount?: number } }>;
      }>(
        apiKey,
        'playlists',
        {
          part: 'snippet,contentDetails',
          id: playlistId
        },
        maxRetries
      );

      const item = response.items?.[0];
      if (!item) {
        throw new UpstreamError('Playlist not found or not accessible.', 404);
      }

      return {
        playlistId,
        playlistTitle: item.snippet?.title ?? 'Untitled Playlist',
        itemCount: item.contentDetails?.itemCount ?? 0
      };
    },

    async *iteratePlaylistVideoIds(playlistId: string, maxItems: number, batchSize: number = 50): AsyncGenerator<string[]> {
      let nextPageToken: string | undefined;
      let emitted = 0;

      while (emitted < maxItems) {
        const remaining = maxItems - emitted;
        const requestSize = Math.min(batchSize, remaining);

        const response = await makeRequest<{
          nextPageToken?: string;
          items?: Array<{ contentDetails?: { videoId?: string } }>;
        }>(
          apiKey,
          'playlistItems',
          {
            part: 'contentDetails',
            playlistId,
            maxResults: String(requestSize),
            ...(nextPageToken ? { pageToken: nextPageToken } : {})
          },
          maxRetries
        );

        const ids = (response.items ?? [])
          .map((item) => item.contentDetails?.videoId)
          .filter((id): id is string => Boolean(id));

        if (ids.length === 0) {
          break;
        }

        emitted += ids.length;
        yield ids;

        if (!response.nextPageToken) {
          break;
        }
        nextPageToken = response.nextPageToken;
      }
    },

    async getVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]> {
      if (videoIds.length === 0) {
        return [];
      }

      const response = await makeRequest<{ items?: YouTubeVideo[] }>(
        apiKey,
        'videos',
        {
          part: 'snippet,contentDetails,statistics',
          id: videoIds.join(',')
        },
        maxRetries
      );

      return response.items ?? [];
    }
  };
};
