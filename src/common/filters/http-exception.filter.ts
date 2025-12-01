import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiErrorResponse } from '../interfaces/api-response.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let statusCode: number;
    let message: string;
    let error: string | undefined;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || exception.message || 'An error occurred';
        error = responseObj.error;
      } else {
        message = exception.message || 'An error occurred';
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception instanceof Error ? exception.message : 'Internal server error';
      error = 'Internal Server Error';
      stack = exception instanceof Error ? exception.stack : undefined;
    }

    // Log error to console
    const logMessage = `${request.method} ${request.url} - ${statusCode} - ${message}`;
    if (statusCode >= 500) {
      this.logger.error(logMessage, stack || exception);
    } else {
      this.logger.warn(logMessage);
    }

    const errorResponse: ApiErrorResponse = {
      statusCode,
      message,
      ...(error && { error }),
      timestamp: new Date().toISOString()
    };

    response.status(statusCode).json(errorResponse);
  }
}


