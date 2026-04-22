import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';

@ApiTags('Public Agents')
@Controller('public/agents')
export class PublicTenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

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
}
