import { Global, Module } from '@nestjs/common';

import { UploadsController } from './controllers/uploads.controller';
import { AppwriteStorageService } from './services/appwrite-storage.service';
import { EncryptionService } from './services/encryption.service';
import { MailService } from './services/mail.service';
import { RequestContextService } from './utils/request-context.service';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [RequestContextService, AppwriteStorageService, EncryptionService, MailService],
  exports: [RequestContextService, AppwriteStorageService, EncryptionService, MailService]
})
export class CommonModule { }





