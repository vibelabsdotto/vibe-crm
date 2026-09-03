import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Maps every error to the contract shape `{ error: string }` with the known
 * codes (contract §4): unauthorized, not_found, bad_request, conflict,
 * unprocessable (+ unknown_fields/valid_fields), payload_too_large,
 * invalid_json, rate_limited, internal_error. Body-parser failures are mapped
 * to client errors — never raw V8 messages, never 500 for client mistakes.
 *
 * 400/409 carry the service's descriptive message (e.g. unknown stage +
 * valid keys, reassign_to hint); 401/404 normalize to their codes.
 */
@Catch()
export class JsonExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(JsonExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    let status = statusOf(exception);
    // Raw body-parser errors carry their own HTTP status but are NOT
    // HttpExceptions — statusOf() would report 500 for them.
    if (isBodyParserError(exception, 'entity.too.large')) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
    } else if (isBodyParserError(exception, 'entity.parse.failed')) {
      status = HttpStatus.BAD_REQUEST;
    }

    const statusNum: number = status;
    if (statusNum === Number(HttpStatus.PAYLOAD_TOO_LARGE)) {
      response.status(status).json({ error: 'payload_too_large' });
      return;
    }
    if (statusNum === Number(HttpStatus.TOO_MANY_REQUESTS)) {
      response.status(status).json({ error: 'rate_limited' });
      return;
    }
    if (statusNum >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      response.status(status).json({ error: 'internal_error' });
      return;
    }
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      // ValidationPipe failures (array message) → generic client code.
      if (
        typeof raw === 'object' &&
        raw !== null &&
        Array.isArray((raw as { message?: unknown }).message)
      ) {
        response.status(status).json({ error: 'bad_request' });
        return;
      }
      // Structured contract bodies (422 unknown-fields) pass through as-is.
      if (typeof raw === 'object' && raw !== null && 'error' in raw) {
        response.status(status).json(raw);
        return;
      }
      const message = typeof raw === 'string' ? raw : undefined;
      if (statusNum === Number(HttpStatus.UNAUTHORIZED)) {
        response.status(status).json({ error: 'unauthorized' });
        return;
      }
      if (statusNum === Number(HttpStatus.NOT_FOUND)) {
        response.status(status).json({ error: 'not_found' });
        return;
      }
      if (
        statusNum === Number(HttpStatus.BAD_REQUEST) &&
        exception instanceof BadRequestException &&
        message !== undefined &&
        isJsonParseMessage(message)
      ) {
        // Nest's routes-resolver maps body-parser SyntaxErrors to a plain
        // BadRequestException(err.message) BEFORE our filter sees them — the
        // original entity.parse.failed type is gone. Normalize to contract code.
        response.status(status).json({ error: 'invalid_json' });
        return;
      }
      response.status(status).json({ error: message ?? 'request_failed' });
      return;
    }
    this.logger.error(
      `${request.method} ${request.originalUrl} failed`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(status).json({ error: 'internal_error' });
  }
}

function statusOf(exception: unknown): number {
  if (!(exception instanceof HttpException)) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
  return exception.getStatus();
}

function isBodyParserError(exception: unknown, type: string): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const candidate = exception as {
    type?: unknown;
    expose?: boolean;
    statusCode?: number;
  };
  return candidate.type === type && candidate.expose === true;
}

/** Detects V8/Express JSON SyntaxError texts after Nest re-wrapped them. */
function isJsonParseMessage(message: string): boolean {
  return (
    message.includes('in JSON at position') ||
    message.startsWith('Unexpected token') ||
    message.startsWith('Expected ') ||
    message.includes('entity.parse.failed')
  );
}
