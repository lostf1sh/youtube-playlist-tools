import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExtractionRequest,
  ExtractionStatusResponse,
  JobStatus,
  LargePlaylistChoice,
  VideoItem,
  ViewMode,
  VideosPageResponse
} from '@ypt/shared';
import { ApiError, buildCsvExportUrl, createExtraction, createSseUrl, getVideosPage } from './api';
import { formatIsoDuration } from './lib';

type LargeChoiceCode = 'first500' | 'first1000' | 'all';

type PendingLargeChoice = {
  payload: ExtractionRequest;
  itemCount: number;
};

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_PRESETS = [10, 25, 50, 100];
const ALL_COLUMNS: Array<keyof VideoItem> = [
  'title',
  'url',
  'channelTitle',
  'publishedAt',
  'duration',
  'viewCount',
  'likeCount',
  'thumbnailUrl'
];

const computeTargetCount = (itemCount: number, choice?: LargePlaylistChoice): number => {
  if (itemCount <= 1000) {
    return itemCount;
  }

  if (!choice || choice === 'all') {
    return itemCount;
  }

  if (choice === 'first500') {
    return Math.min(500, itemCount);
  }

  return Math.min(1000, itemCount);
};

const statusLabel = (status: JobStatus): string => {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
  }
};

function App() {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('realtime');
  const [currentView, setCurrentView] = useState<ViewMode>('realtime');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [customPageSize, setCustomPageSize] = useState('');

  const [job, setJob] = useState<ExtractionStatusResponse | null>(null);
  const [realtimeItems, setRealtimeItems] = useState<VideoItem[]>([]);
  const [pageData, setPageData] = useState<VideosPageResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isStarting, setIsStarting] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [progressTick, setProgressTick] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<Array<keyof VideoItem>>([...ALL_COLUMNS]);
  const [pendingLargeChoice, setPendingLargeChoice] = useState<PendingLargeChoice | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const effectivePageSize = useMemo(() => {
    if (customPageSize.trim().length === 0) {
      return pageSize;
    }

    const parsed = Number.parseInt(customPageSize, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return pageSize;
    }

    return parsed;
  }, [customPageSize, pageSize]);

  const progressPercent = useMemo(() => {
    if (!job || job.totalTarget === 0) {
      return 0;
    }
    return Math.min(100, Math.round((job.processed / job.totalTarget) * 100));
  }, [job]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!job || !job.jobId || currentView !== 'paginated') {
      return;
    }

    const timer = setTimeout(() => {
      void loadPage(job.jobId, currentPage, effectivePageSize);
    }, 180);

    return () => clearTimeout(timer);
  }, [job?.jobId, currentView, currentPage, effectivePageSize, progressTick]);

  const connectSse = (jobId: string): void => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource(createSseUrl(jobId));

    source.addEventListener('job_started', () => {
      setJob((prev) => (prev ? { ...prev, status: 'running' } : prev));
    });

    source.addEventListener('video_added', (event) => {
      const payload = JSON.parse(event.data) as { item: VideoItem };
      setRealtimeItems((prev) => [...prev, payload.item]);
    });

    source.addEventListener('progress', (event) => {
      const payload = JSON.parse(event.data) as { processed: number; totalTarget: number; status: JobStatus };
      setJob((prev) =>
        prev
          ? {
            ...prev,
            processed: payload.processed,
            totalTarget: payload.totalTarget,
            status: payload.status
          }
          : prev
      );
      setProgressTick((value) => value + 1);
    });

    source.addEventListener('job_completed', (event) => {
      const payload = JSON.parse(event.data) as { processed: number; totalTarget: number };
      setJob((prev) =>
        prev
          ? {
            ...prev,
            status: 'completed',
            processed: payload.processed,
            totalTarget: payload.totalTarget
          }
          : prev
      );
      setSuccessMessage('Playlist extraction completed.');
      source.close();
    });

    source.addEventListener('job_failed', (event) => {
      const payload = JSON.parse(event.data) as { error?: string; processed: number; totalTarget: number };
      setJob((prev) =>
        prev
          ? {
            ...prev,
            status: 'failed',
            error: payload.error,
            processed: payload.processed,
            totalTarget: payload.totalTarget
          }
          : prev
      );
      setErrorMessage(payload.error ?? 'Extraction failed.');
      source.close();
    });

    source.onerror = () => {
      source.close();
    };

    eventSourceRef.current = source;
  };

  const loadPage = async (jobId: string, page: number, localPageSize: number): Promise<void> => {
    setIsPageLoading(true);
    try {
      const response = await getVideosPage(jobId, page, localPageSize);
      setPageData(response);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to load page data.');
      }
    } finally {
      setIsPageLoading(false);
    }
  };

  const startExtraction = async (payload: ExtractionRequest): Promise<void> => {
    setIsStarting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const created = await createExtraction(payload);
      const summary: ExtractionStatusResponse = {
        jobId: created.jobId,
        playlistId: created.playlistId,
        playlistTitle: created.playlistTitle,
        status: 'queued',
        processed: 0,
        totalTarget: computeTargetCount(created.itemCount, payload.largePlaylistChoice),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      };

      setJob(summary);
      setRealtimeItems([]);
      setPageData(null);
      setCurrentPage(1);
      setCurrentView(payload.mode);
      connectSse(created.jobId);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        typeof error.details === 'object' &&
        error.details !== null &&
        'code' in error.details &&
        (error.details as { code?: string }).code === 'LARGE_PLAYLIST_CHOICE_REQUIRED'
      ) {
        const details = error.details as { itemCount?: number };
        setPendingLargeChoice({
          payload,
          itemCount: details.itemCount ?? 0
        });
      } else if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to start extraction.');
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    const payload: ExtractionRequest = {
      playlistUrl,
      mode: viewMode,
      ...(viewMode === 'paginated' ? { pageSize: effectivePageSize } : {})
    };

    await startExtraction(payload);
  };

  const handleLargeChoice = async (choice: LargeChoiceCode): Promise<void> => {
    if (!pendingLargeChoice) {
      return;
    }

    const payload: ExtractionRequest = {
      ...pendingLargeChoice.payload,
      largePlaylistChoice: choice
    };

    setPendingLargeChoice(null);
    await startExtraction(payload);
  };

  const toggleColumn = (column: keyof VideoItem): void => {
    setVisibleColumns((prev) => {
      if (prev.includes(column)) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter((item) => item !== column);
      }
      return [...prev, column];
    });
  };

  const getRenderedItems = (): VideoItem[] => {
    if (currentView === 'realtime') {
      return realtimeItems;
    }
    return pageData?.items ?? [];
  };

  const copyUrls = async (): Promise<void> => {
    if (!job) {
      return;
    }

    setIsCopying(true);
    setErrorMessage(null);

    try {
      const urls: string[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await getVideosPage(job.jobId, page, 500);
        totalPages = response.pagination.totalPages;
        for (const item of response.items) {
          urls.push(item.url);
        }
        page += 1;
      } while (page <= totalPages);

      await navigator.clipboard.writeText(urls.join('\n'));
      setSuccessMessage(`${urls.length} video URLs copied to clipboard.`);
    } catch {
      setErrorMessage('Bulk URL copy failed.');
    } finally {
      setIsCopying(false);
    }
  };

  const exportCsv = (): void => {
    if (!job) {
      return;
    }
    const url = buildCsvExportUrl(job.jobId, visibleColumns);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const renderedItems = getRenderedItems();

  return (
    <div className="min-h-screen">
      <nav className="border-b border-ctp-surface0 bg-ctp-mantle">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <a href="/" className="flex items-center gap-2 text-ctp-text transition hover:text-ctp-lavender">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-ctp-red">
              <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" />
            </svg>
            <span className="text-sm font-semibold">Playlist Extractor</span>
          </a>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/lostf1sh/youtube-playlist-tools"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-ctp-subtext0 transition hover:text-ctp-lavender"
            >
              Repository
            </a>
            <a
              href="https://github.com/lostf1sh"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-ctp-surface0 px-3 py-1.5 text-xs font-medium text-ctp-subtext1 transition hover:bg-ctp-surface1 hover:text-ctp-text"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              lostf1sh
            </a>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <section className="rounded-2xl border border-ctp-surface0 bg-ctp-base p-6 shadow-lg shadow-black/20 md:p-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ctp-text">YouTube Playlist Extractor</h1>
              <p className="mt-1.5 text-sm text-ctp-subtext0">
                Enter a playlist URL to extract video metadata, copy URLs in bulk, and export as CSV.
              </p>
            </div>
            {job ? (
              <div className="rounded-xl bg-ctp-surface0 px-4 py-3 text-sm text-ctp-subtext1">
                <div className="font-semibold text-ctp-lavender">{job.playlistTitle}</div>
                <div>
                  Status: <span className="text-ctp-text">{statusLabel(job.status)}</span>
                </div>
                <div className="tabular-nums">
                  {job.processed}/{job.totalTarget}
                </div>
              </div>
            ) : null}
          </header>

          <form className="grid gap-4 rounded-xl border border-ctp-surface0 bg-ctp-mantle p-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm font-medium text-ctp-subtext1">
              Playlist URL
              <input
                className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 outline-none transition focus:border-ctp-lavender focus:ring-2 focus:ring-ctp-lavender/20"
                placeholder="https://www.youtube.com/playlist?list=..."
                value={playlistUrl}
                onChange={(event) => setPlaylistUrl(event.target.value)}
                required
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <fieldset className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-ctp-overlay1">
                  View Mode
                </legend>
                <div className="mt-2 flex gap-3 text-sm text-ctp-subtext1">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="mode"
                      className="accent-ctp-mauve"
                      checked={viewMode === 'realtime'}
                      onChange={() => setViewMode('realtime')}
                    />
                    Realtime
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="mode"
                      className="accent-ctp-mauve"
                      checked={viewMode === 'paginated'}
                      onChange={() => setViewMode('paginated')}
                    />
                    Paginated
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-ctp-overlay1">
                  Page Size (Paginated)
                </legend>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-sm text-ctp-text"
                    value={PAGE_SIZE_PRESETS.includes(pageSize) ? String(pageSize) : 'custom'}
                    onChange={(event) => {
                      const selected = event.target.value;
                      if (selected === 'custom') {
                        return;
                      }
                      setPageSize(Number.parseInt(selected, 10));
                      setCustomPageSize('');
                    }}
                  >
                    {PAGE_SIZE_PRESETS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                    <option value="custom">Custom</option>
                  </select>
                  <input
                    className="w-24 rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-sm text-ctp-text placeholder-ctp-overlay0"
                    placeholder="Custom"
                    value={customPageSize}
                    onChange={(event) => setCustomPageSize(event.target.value)}
                  />
                </div>
              </fieldset>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-semibold text-ctp-crust transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isStarting}
              >
                {isStarting ? 'Starting...' : 'Extract Playlist'}
              </button>

              {job ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-4 py-2 text-sm font-semibold text-ctp-text transition hover:bg-ctp-surface1"
                    onClick={copyUrls}
                    disabled={isCopying}
                  >
                    {isCopying ? 'Copying...' : 'Copy URLs'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-4 py-2 text-sm font-semibold text-ctp-text transition hover:bg-ctp-surface1"
                    onClick={exportCsv}
                  >
                    Export CSV
                  </button>
                </>
              ) : null}
            </div>
          </form>

          {job ? (
            <section className="mt-6 rounded-xl border border-ctp-surface0 bg-ctp-mantle p-4">
              <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-ctp-surface0">
                    <div
                      className="h-full rounded-full bg-ctp-blue transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-ctp-subtext0">
                    {job.processed} / {job.totalTarget} (%{progressPercent})
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1 text-sm font-semibold transition ${currentView === 'realtime'
                      ? 'bg-ctp-mauve text-ctp-crust'
                      : 'bg-ctp-surface0 text-ctp-subtext1 hover:bg-ctp-surface1'
                      }`}
                    onClick={() => setCurrentView('realtime')}
                  >
                    Realtime View
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1 text-sm font-semibold transition ${currentView === 'paginated'
                      ? 'bg-ctp-mauve text-ctp-crust'
                      : 'bg-ctp-surface0 text-ctp-subtext1 hover:bg-ctp-surface1'
                      }`}
                    onClick={() => setCurrentView('paginated')}
                  >
                    Paginated View
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2 rounded-lg bg-ctp-base p-3 text-xs text-ctp-subtext0">
                {ALL_COLUMNS.map((column) => (
                  <label
                    key={column}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-ctp-surface0 px-2 py-1 transition hover:bg-ctp-surface1"
                  >
                    <input
                      type="checkbox"
                      className="accent-ctp-mauve"
                      checked={visibleColumns.includes(column)}
                      onChange={() => toggleColumn(column)}
                    />
                    {column}
                  </label>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg border border-ctp-surface0">
                <table className="min-w-full divide-y divide-ctp-surface0 text-left text-sm">
                  <thead className="bg-ctp-base text-xs uppercase tracking-wider text-ctp-overlay1">
                    <tr>
                      {visibleColumns.map((column) => (
                        <th key={column} className="px-3 py-2">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ctp-surface0/60 bg-ctp-mantle">
                    {renderedItems.length === 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length} className="px-3 py-8 text-center text-sm text-ctp-overlay0">
                          {isPageLoading ? 'Loading page...' : 'No videos yet.'}
                        </td>
                      </tr>
                    ) : (
                      renderedItems.map((item) => (
                        <tr key={item.videoId} className="transition hover:bg-ctp-surface0/40">
                          {visibleColumns.map((column) => {
                            const value = (() => {
                              if (column === 'duration') {
                                return formatIsoDuration(item.duration);
                              }
                              return item[column];
                            })();

                            return (
                              <td
                                key={`${item.videoId}-${column}`}
                                className="max-w-[320px] truncate px-3 py-2 text-ctp-subtext1"
                              >
                                {String(value ?? '')}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {currentView === 'paginated' ? (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-3 py-1 text-ctp-text transition hover:bg-ctp-surface1 disabled:opacity-40"
                    disabled={!pageData || currentPage <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    Prev
                  </button>
                  <span className="text-ctp-subtext0">
                    Page {currentPage} / {pageData?.pagination.totalPages ?? 1}
                  </span>
                  <button
                    type="button"
                    className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-3 py-1 text-ctp-text transition hover:bg-ctp-surface1 disabled:opacity-40"
                    disabled={!pageData || currentPage >= (pageData?.pagination.totalPages ?? 1)}
                    onClick={() => setCurrentPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {errorMessage ? (
            <p className="mt-4 rounded-lg bg-ctp-red/10 px-3 py-2 text-sm text-ctp-red">{errorMessage}</p>
          ) : null}
          {successMessage ? (
            <p className="mt-4 rounded-lg bg-ctp-green/10 px-3 py-2 text-sm text-ctp-green">{successMessage}</p>
          ) : null}
        </section>
      </main>

      {pendingLargeChoice ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-ctp-crust/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-ctp-surface0 bg-ctp-base p-6 shadow-2xl shadow-black/40">
            <h2 className="text-xl font-semibold text-ctp-text">Large playlist detected</h2>
            <p className="mt-2 text-sm text-ctp-subtext0">
              This playlist contains approximately {pendingLargeChoice.itemCount} videos. Choose the scope for the initial extraction.
            </p>
            <div className="mt-4 grid gap-2">
              <button
                className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-4 py-2.5 text-left text-sm text-ctp-text transition hover:bg-ctp-surface1 hover:border-ctp-lavender"
                onClick={() => void handleLargeChoice('first500')}
              >
                First 500 videos
              </button>
              <button
                className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-4 py-2.5 text-left text-sm text-ctp-text transition hover:bg-ctp-surface1 hover:border-ctp-lavender"
                onClick={() => void handleLargeChoice('first1000')}
              >
                First 1,000 videos
              </button>
              <button
                className="rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-4 py-2.5 text-left text-sm text-ctp-text transition hover:bg-ctp-surface1 hover:border-ctp-lavender"
                onClick={() => void handleLargeChoice('all')}
              >
                All videos
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
