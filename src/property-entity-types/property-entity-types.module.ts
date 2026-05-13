import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { PropertyEntityTypesController } from './property-entity-types.controller';
import { PropertyEntityTypesService } from './property-entity-types.service';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [PropertyEntityTypesController],
  providers: [PropertyEntityTypesService],
  exports: [PropertyEntityTypesService],
})
export class PropertyEntityTypesModule {}
