# YouTube Playlist Extractor (Bun-First Monorepo)

A web application that extracts video links and metadata from public/unlisted YouTube playlist URLs, with `Realtime` and `Paginated` viewing modes.

## Features

- Playlist URL video extraction (YouTube Data API v3)
- Realtime streaming (line-by-line updates via SSE)
- Paginated view + page size selection (`10/25/50/100 + custom`)
- Large playlist (1000+) user prompt: `first500`, `first1000`, `all`
- Bulk copy (default: URLs only, one per line)
- CSV export (with UI-visible columns)
- Bun workspace-based monorepo

## Tech Stack

- Runtime + package manager: [Bun](https://bun.sh)
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Fastify + TypeScript
- Realtime transport: Server-Sent Events (SSE)
- Shared contracts: `packages/shared`
- Tests: Vitest + Playwright

## Monorepo Structure

```text
.
├─ apps/
│  ├─ api/        # Fastify API, extraction logic, SSE
│  └─ web/        # React web app
├─ packages/
│  └─ shared/     # Shared types and API contracts
└─ .github/
   └─ workflows/  # Bun CI
```

## Requirements

- Bun `>= 1.3.10`
- YouTube Data API v3 key

## Quick Start

1. Install dependencies:

```bash
bun install
```

2. Set up API environment variables:

```bash
cp apps/api/.env.example apps/api/.env
```

3. Add your `YOUTUBE_API_KEY` to `apps/api/.env`.

4. Start the development servers:

```bash
bun run dev
```

5. Open the apps:

- Web: `http://localhost:5173`
- API: `http://localhost:8787`

## Environment Variables (API)

`apps/api/.env`

- `YOUTUBE_API_KEY` (required)
- `API_PORT` (default: `8787`)
- `JOB_TTL_MINUTES` (default: `60`)
- `ALLOWED_ORIGIN` (default: `http://localhost:5173`)
- `BATCH_SIZE` (default: `50`) — number of videos fetched per API batch
- `BATCH_DELAY_MS` (default: `500`) — delay in ms between batches to avoid rate limits

## Scripts

From the root:

```bash
bun run dev
bun run test
bun run build
bun run test:e2e
```

## API Contract (MVP)

- `POST /api/extractions`
- `GET /api/extractions/:jobId`
- `GET /api/extractions/:jobId/videos?page=1&pageSize=25`
- `GET /api/extractions/:jobId/events` (SSE)
- `GET /api/extractions/:jobId/export.csv?columns=title,url,...`

### `POST /api/extractions` example body

```json
{
  "playlistUrl": "https://www.youtube.com/playlist?list=...",
  "mode": "realtime",
  "pageSize": 25,
  "largePlaylistChoice": "first1000"
}
```

### Large playlist behavior

- If the playlist video count is `> 1000`, the API returns `409` + `LARGE_PLAYLIST_CHOICE_REQUIRED`.
- The client then prompts the user for a choice and retries the request with `largePlaylistChoice`.

## Product Notes

- Private playlists are not supported in this version.
- No OAuth/Auth (MVP scope).
- Results are stored in-memory (no persistent storage).
- Designed for low/moderate traffic.

## Tests

- Unit: parser, normalize, CSV mapper
- Integration: extraction flow, pagination, large playlist choice
- SSE order test: `job_started -> ... -> job_completed`
- E2E: basic UI render flow

## CI

GitHub Actions workflow:

- Bun setup
- `bun install --frozen-lockfile`
- `bun run test`
- `bun run build`

File: `.github/workflows/ci.yml`

## Deployment Notes

- Use a platform that supports long-lived processes (required for SSE + background extraction).
- If the API and web are on different domains, set `ALLOWED_ORIGIN` accordingly.
- In production, configure `Cache-Control` and timeout settings on your reverse proxy to be SSE-compatible.

## License

No license is currently defined. If you plan to share this as open-source, add a `LICENSE` file (e.g. MIT).
