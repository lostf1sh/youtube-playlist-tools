export type ViewMode = 'realtime' | 'paginated';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type LargePlaylistChoice = 'first500' | 'first1000' | 'all';

export type VideoItem = {
  videoId: string;
  title: string;
  url: string;
  channelTitle: string;
  publishedAt: string;
  duration: string;
  viewCount: number | null;
  likeCount: number | null;
  thumbnailUrl: string;
};

export type ExtractionJob = {
  jobId: string;
  playlistId: string;
  playlistTitle: string;
  status: JobStatus;
  processed: number;
  totalTarget: number;
  items: VideoItem[];
  error?: string;
  createdAt: string;
  expiresAt: string;
};

export type ExtractionRequest = {
  playlistUrl: string;
  mode: ViewMode;
  pageSize?: number;
  largePlaylistChoice?: LargePlaylistChoice;
};

export type ExtractionCreateResponse = {
  jobId: string;
  playlistId: string;
  playlistTitle: string;
  itemCount: number;
  status: Extract< JobStatus, 'queued' | 'running'>;
};

export type ExtractionStatusResponse = {
  jobId: string;
  playlistId: string;
  playlistTitle: string;
  status: JobStatus;
  processed: number;
  totalTarget: number;
  error?: string;
  createdAt: string;
  expiresAt: string;
};

export type VideosPageResponse = {
  items: VideoItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type SseEventName =
  | 'job_started'
  | 'video_added'
  | 'progress'
  | 'job_completed'
  | 'job_failed';

export type SseEventPayload = {
  event: SseEventName;
  data: unknown;
};
