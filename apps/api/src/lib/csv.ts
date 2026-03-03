import type { VideoItem } from '@ypt/shared';

export const CSV_COLUMN_MAP: Record<string, (item: VideoItem) => string | number | null> = {
  videoId: (item) => item.videoId,
  title: (item) => item.title,
  url: (item) => item.url,
  channelTitle: (item) => item.channelTitle,
  publishedAt: (item) => item.publishedAt,
  duration: (item) => item.duration,
  viewCount: (item) => item.viewCount,
  likeCount: (item) => item.likeCount,
  thumbnailUrl: (item) => item.thumbnailUrl
};

const escapeCell = (value: string | number | null): string => {
  if (value === null) {
    return '';
  }

  const stringValue = String(value);
  const escaped = stringValue.replaceAll('"', '""');
  return `"${escaped}"`;
};

export const toCsv = (items: VideoItem[], columns: string[]): string => {
  const validColumns = columns.filter((column) => column in CSV_COLUMN_MAP);
  const selectedColumns = validColumns.length > 0 ? validColumns : Object.keys(CSV_COLUMN_MAP);

  const header = selectedColumns.map((column) => escapeCell(column)).join(',');
  const rows = items.map((item) => selectedColumns.map((column) => escapeCell(CSV_COLUMN_MAP[column](item))).join(','));

  return [header, ...rows].join('\n');
};
