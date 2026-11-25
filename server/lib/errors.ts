import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'VALIDATION_ERROR'
  | 'COURSE_NOT_FOUND'
  | 'DOCUMENT_NOT_FOUND'
  | 'LECTURE_NOT_FOUND'
  | 'TOPIC_NOT_FOUND'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_REQUIRED'
  | 'NO_FILES'
  | 'NOT_PDF'
  | 'FILE_TOO_LARGE'
  | 'NO_TEXT_LAYER'
  | 'SOME_PAGES_NO_TEXT'
  | 'PARSE_FAILED'
  | 'EMPTY_QUERY'
  | 'QUERY_TOO_LONG'
  | 'CANNOT_MERGE'
  | 'CANNOT_SPLIT'
  | 'OUTLINE_FAILED'
  | 'LLM_REQUEST_FAILED'
  | 'LLM_TIMEOUT'
  | 'MODEL_FALLBACK_DISABLED'
  | 'SEARCH_NOT_CONFIGURED'
  | 'SEARCH_FAILED'
  | 'CHAT_FAILED'
  | 'INTERNAL'
  | 'INTERRUPTED';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly field?: string;

  constructor(status: number, code: ErrorCode, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'INVALID_REQUEST', message: 'Endpoint not found.' } });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, field: error.field },
    });
    return;
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request did not pass validation.',
        field: issue?.path.join('.') || undefined,
      },
    });
    return;
  }
  if (isMulterLimitError(error)) {
    res.status(413).json({
      error: { code: 'FILE_TOO_LARGE', message: 'The file exceeds the upload limit.' },
    });
    return;
  }
  if (isMulterFileCountError(error)) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Too many files in one upload.' },
    });
    return;
  }
  if (isJsonParseError(error)) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'The request body is not valid JSON.' },
    });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  if (message === 'NOT_PDF') {
    res.status(400).json({
      error: {
        code: 'NOT_PDF',
        message: 'Only text-based PDF files are accepted.',
      },
    });
    return;
  }
  console.error('[courseatlas] unhandled error:', message);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'The server could not complete the request.' },
  });
}

function isMulterLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'LIMIT_FILE_SIZE'
  );
}

function isMulterFileCountError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'LIMIT_FILE_COUNT'
  );
}

function isJsonParseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: string }).type === 'entity.parse.failed'
  );
}
