import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';

@ApiTags('Public Registration')
@Controller('public')
export class PublicRegistrationController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('check-slug')
  @ApiOperation({ summary: 'Check if a workspace slug is available (no auth required)' })
  async checkSlug(@Query('slug') slug: string) {
    if (!slug || slug.length < 2) {
      return { exists: false, slug, available: false, reason: 'Slug too short' };
    }
    const existing = await this.tenantsService.findBySlug(slug.toLowerCase().trim());
    return { exists: !!existing, slug, available: !existing };
  }
}
