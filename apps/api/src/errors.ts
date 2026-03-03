export class AppError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class BadRequestError extends AppError {
  public constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  public constructor(message: string) {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  public readonly details: Record<string, unknown>;

  public constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 409);
    this.details = details;
  }
}

export class UnauthorizedResourceError extends AppError {
  public constructor(message: string) {
    super(message, 403);
  }
}

export class UpstreamError extends AppError {
  public constructor(message: string, statusCode = 502) {
    super(message, statusCode);
  }
}
