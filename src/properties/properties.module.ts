import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';

import { LeadPropertyInterestsController } from './lead-property-interests.controller';
import { PropertiesService } from './properties.service';
import { PropertyAttributeValuesController } from './property-attribute-values.controller';
import { PropertyAttributesController } from './property-attributes.controller';
import { PropertyEntitiesController } from './property-entities.controller';
import { PropertyMediaController } from './property-media.controller';
import { PropertyPricingController } from './property-pricing.controller';
import { PropertyUnitsController } from './property-units.controller';
import { PropertyDocumentsController } from './documents/property-documents.controller';
import { PropertyDocumentsService } from './documents/property-documents.service';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [
    PropertyEntitiesController,
    PropertyUnitsController,
    PropertyAttributesController,
    PropertyAttributeValuesController,
    PropertyMediaController,
    LeadPropertyInterestsController,
    PropertyPricingController,
    PropertyDocumentsController
  ],
  providers: [PropertiesService, PropertyDocumentsService],
  exports: [PropertiesService, PropertyDocumentsService]
})
export class PropertiesModule {}

