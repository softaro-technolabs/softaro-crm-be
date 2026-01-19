import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';

import { LeadPropertyInterestsController } from './lead-property-interests.controller';
import { PropertiesService } from './properties.service';
import { PropertyAttributeValuesController } from './property-attribute-values.controller';
import { PropertyAttributesController } from './property-attributes.controller';
import { PropertyEntitiesController } from './property-entities.controller';
import { PropertyLocationsController } from './property-locations.controller';
import { PropertyMediaController } from './property-media.controller';
import { PropertyPricingController } from './property-pricing.controller';
import { PropertyUnitsController } from './property-units.controller';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [
    PropertyEntitiesController,
    PropertyLocationsController,
    PropertyUnitsController,
    PropertyAttributesController,
    PropertyAttributeValuesController,
    PropertyMediaController,
    LeadPropertyInterestsController,
    PropertyPricingController
  ],
  providers: [PropertiesService],
  exports: [PropertiesService]
})
export class PropertiesModule {}

