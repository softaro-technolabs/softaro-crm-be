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
    
    // For each entity, we need the location
    const propertiesWithLocation = await Promise.all(
      result.data.map(async (entity: any) => {
        const location = await this.propertiesService.getEntityLocation(tenant.id, entity.id);
        const media = await this.propertiesService.listMedia(tenant.id, { entityId: entity.id });
        
        return {
          ...entity,
          location,
          thumbnail: media.find(m => m.mediaType === 'image')?.fileUrl || null
        };
      })
    );

    return propertiesWithLocation;
  }
}
