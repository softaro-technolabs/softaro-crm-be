import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { PropertiesService } from '../properties/properties.service';

@ApiTags('Public Agents')
@Controller('public/agents')
export class PublicTenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly propertiesService: PropertiesService
  ) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get public agent details for website' })
  async getPublicTenant(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    
    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException('Agent not found');
    }

    // Return only public fields
    return {
      name: tenant.name,
      slug: tenant.slug,
      logo: tenant.logo,
      description: tenant.description,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      address: tenant.address,
      socialLinks: tenant.socialLinks,
      websiteConfig: tenant.websiteConfig
    };
  }

  @Get(':slug/properties')
  @ApiOperation({ summary: 'Get public properties for an agent' })
  async getPublicProperties(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Agent not found');

    // Fetch all property entities for this tenant
    const result = await this.propertiesService.listEntities(tenant.id, { limit: 100 });
    
    // For each entity, fetch deep details
    const propertiesWithFullInfo = await Promise.all(
      result.data.map(async (entity: any) => {
        const [location, media, attributes, unitsResult] = await Promise.all([
          this.propertiesService.getEntityLocation(tenant.id, entity.id),
          this.propertiesService.listMedia(tenant.id, { entityId: entity.id }),
          this.propertiesService.listEntityAttributeValues(tenant.id, entity.id),
          this.propertiesService.listUnits(tenant.id, { entityId: entity.id, limit: 100 })
        ]);

        // Calculate price range from units
        const units = unitsResult.data || [];
        const prices = units
          .map(u => parseFloat(u.unit.price || '0'))
          .filter(p => !isNaN(p));
        
        const minPrice = prices.length > 0 ? Math.min(...prices) : null;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

        return {
          id: entity.id,
          name: entity.name,
          description: entity.description,
          entityType: entity.entityType,
          status: entity.status,
          location,
          media, // Full gallery
          thumbnail: media.find((m: any) => m.mediaType === 'image')?.fileUrl || null,
          attributes, // Beds, Baths, etc.
          price: (minPrice !== null && maxPrice !== null) 
            ? (minPrice === maxPrice ? `AED ${minPrice.toLocaleString()}` : `AED ${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}`) 
            : 'On Request',
          unitCount: units.length
        };
      })
    );

    return propertiesWithFullInfo;
  }
}
