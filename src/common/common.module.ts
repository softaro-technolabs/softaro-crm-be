import { Global, Module } from '@nestjs/common';

import { RequestContextService } from './utils/request-context.service';
import { AppwriteStorageService } from './services/appwrite-storage.service';
import { UploadsController } from './controllers/uploads.controller';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [RequestContextService, AppwriteStorageService],
  exports: [RequestContextService, AppwriteStorageService]
})
export class CommonModule { }





