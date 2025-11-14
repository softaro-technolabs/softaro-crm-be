import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;

    return next.handle().pipe(
      map((data) => {
        // If data is already in the correct format, return it as is
        if (data && typeof data === 'object' && 'statusCode' in data && 'message' in data && 'data' in data && 'timestamp' in data) {
          return data;
        }

        // Determine status code and message based on HTTP method
        let statusCode: number;
        let message: string;

        switch (method) {
          case 'POST':
            // Check if response status was explicitly set, otherwise default to CREATED
            statusCode = response.statusCode && response.statusCode !== 200 
              ? response.statusCode 
              : HttpStatus.CREATED;
            message = statusCode === HttpStatus.CREATED 
              ? 'Resource created successfully' 
              : 'Operation completed successfully';
            break;
          case 'GET':
            statusCode = response.statusCode || HttpStatus.OK;
            message = 'Data retrieved successfully';
            break;
          case 'PUT':
          case 'PATCH':
            statusCode = response.statusCode || HttpStatus.OK;
            message = 'Resource updated successfully';
            break;
          case 'DELETE':
            statusCode = response.statusCode || HttpStatus.OK;
            message = 'Resource deleted successfully';
            break;
          default:
            statusCode = response.statusCode || HttpStatus.OK;
            message = 'Success';
        }

        return {
          statusCode,
          message,
          data: data ?? null,
          timestamp: new Date().toISOString()
        };
      })
    );
  }
}

