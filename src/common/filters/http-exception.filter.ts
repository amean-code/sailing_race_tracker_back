import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Sunucu hatası';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null && 'message' in body) {
        const msg = (body as { message: string | string[] }).message;
        message = Array.isArray(msg) ? msg.join(', ') : msg;
      }
      
      // Log HTTP Exceptions (like 400, 401, 403, 404)
      this.logger.warn(`[${request.method}] ${request.url} - Status: ${status} - Error: ${message}`);
    } else {
      // Log critical, unhandled errors (500) with full stack trace
      this.logger.error(
        `[${request.method}] ${request.url} - Unhandled Exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        exception instanceof Error ? exception.stack : '',
      );
    }

    response.status(status).json({ error: message, message, statusCode: status });
  }
}
