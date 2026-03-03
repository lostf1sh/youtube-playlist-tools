import type {
  ExtractionCreateResponse,
  ExtractionRequest,
  ExtractionStatusResponse,
  VideosPageResponse
} from '@ypt/shared';
import { parseErrorMessage } from './lib';

export class ApiError extends Error {
  public readonly status: number;

  public readonly details: unknown;

  public constructor(message: string, status: number, details: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const requestJson = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options?.headers ?? {})
    }
  });

  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = null;
    }
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status, details);
  }

  return (await response.json()) as T;
};

export const createExtraction = async (payload: ExtractionRequest): Promise<ExtractionCreateResponse> => {
  return await requestJson<ExtractionCreateResponse>('/api/extractions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

export const getExtractionStatus = async (jobId: string): Promise<ExtractionStatusResponse> => {
  return await requestJson<ExtractionStatusResponse>(`/api/extractions/${jobId}`);
};

export const getVideosPage = async (jobId: string, page: number, pageSize: number): Promise<VideosPageResponse> => {
  return await requestJson<VideosPageResponse>(`/api/extractions/${jobId}/videos?page=${page}&pageSize=${pageSize}`);
};

export const buildCsvExportUrl = (jobId: string, columns: string[]): string => {
  const search = new URLSearchParams();
  search.set('columns', columns.join(','));
  return `${API_BASE_URL}/api/extractions/${jobId}/export.csv?${search.toString()}`;
};

export const createSseUrl = (jobId: string): string => {
  return `${API_BASE_URL}/api/extractions/${jobId}/events`;
};
