import { Global, Module } from '@nestjs/common';

import { RequestContextService } from './utils/request-context.service';

@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService]
})
export class CommonModule {}



