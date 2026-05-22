import {
  Controller, Get, Post, Param, Body,
  NotFoundException, BadRequestException, UseGuards, Req
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail, MaxLength, IsDateString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { TenantsService } from './tenants.service';
import { PropertiesService } from '../properties/properties.service';
import { LeadsService } from '../leads/leads.service';
import { LeadAssignmentService } from '../leads/lead-assignment.service';

// ── DTOs ──────────────────────────────────────────────────────────────────────

class PublicEnquiryDto {
  @IsString() @IsNotEmpty() @MaxLength(100)  name!: string;
  @IsString() @IsNotEmpty() @MaxLength(15)   phone!: string;
  @IsOptional() @IsEmail() @MaxLength(255)   email?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) budget?: number;
  @IsOptional() @IsString() @MaxLength(20)   bhkType?: string;
  @IsOptional() @IsString() @MaxLength(255)  locationPreference?: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsString() @MaxLength(255)  propertyName?: string;
}

class PublicSiteVisitDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(15)  phone!: string;
  @IsOptional() @IsEmail() @MaxLength(255)  email?: string;
  @IsDateString()                            visitDate!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString()                  propertyId?: string;
  @IsOptional() @IsString()                  propertyName?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format price in Indian number system: ₹1,20,000 */
function formatIndianPrice(amount: number): string {
  if (amount >= 1_00_00_000) {
    const cr = (amount / 1_00_00_000).toFixed(amount % 1_00_00_000 === 0 ? 0 : 2);
    return `₹${cr} Cr`;
  }
  if (amount >= 1_00_000) {
    const lac = (amount / 1_00_000).toFixed(amount % 1_00_000 === 0 ? 0 : 2);
    return `₹${lac} Lac`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('Public Agents')
@Controller('public/agents')
export class PublicTenantsController {
  constructor(
    private readonly tenantsService:       TenantsService,
    private readonly propertiesService:    PropertiesService,
    private readonly leadsService:         LeadsService,
    private readonly leadAssignmentService: LeadAssignmentService,
  ) {}

  // ── GET :slug — agent profile ──────────────────────────────────────────────

  @Get(':slug')
  @ApiOperation({ summary: 'Get public agent details for website' })
  async getPublicTenant(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant || tenant.status !== 'active') throw new NotFoundException('Agent not found');

    // Fetch lead-capture API key so the portal can submit enquiries
    const settings = await this.leadAssignmentService.getSettings(tenant.id);

    return {
      id:             tenant.id,
      name:           tenant.name,
      slug:           tenant.slug,
      logo:           tenant.logo,
      description:    tenant.description,
      primaryColor:   tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      contactEmail:   tenant.contactEmail,
      contactPhone:   tenant.contactPhone,
      address:        tenant.address,
      socialLinks:    tenant.socialLinks,
      websiteConfig:  tenant.websiteConfig,
      publicApiKey:   settings?.publicApiKey ?? null,   // used for lead capture
    };
  }

  // ── GET :slug/properties — property listing ────────────────────────────────

  @Get(':slug/properties')
  @ApiOperation({ summary: 'Get public properties for an agent (Indian ₹ pricing)' })
  async getPublicProperties(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Agent not found');

    const result = await this.propertiesService.listEntities(tenant.id, { limit: 200 });

    const propertiesWithFullInfo = await Promise.all(
      result.data.map(async (entity: any) => {
        const [location, media, attributes, unitsResult] = await Promise.all([
          this.propertiesService.getEntityLocation(tenant.id, entity.id),
          this.propertiesService.listMedia(tenant.id, { entityId: entity.id }),
          this.propertiesService.listEntityAttributeValues(tenant.id, entity.id),
          this.propertiesService.listUnits(tenant.id, { entityId: entity.id, limit: 500 }),
        ]);

        const units = unitsResult.data || [];
        const prices = units
          .map((u: any) => parseFloat(u.unit?.price || u.price || '0'))
          .filter((p: number) => p > 0);

        const minPrice = prices.length > 0 ? Math.min(...prices) : null;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

        const priceDisplay =
          minPrice !== null && maxPrice !== null
            ? minPrice === maxPrice
              ? formatIndianPrice(minPrice)
              : `${formatIndianPrice(minPrice)} – ${formatIndianPrice(maxPrice)}`
            : 'Price on request';

        // Summarise unit availability for the inventory badge
        const unitSummary = {
          total:     units.length,
          available: units.filter((u: any) => (u.unit?.unitStatus || u.unitStatus) === 'available').length,
          booked:    units.filter((u: any) => (u.unit?.unitStatus || u.unitStatus) === 'booked').length,
          sold:      units.filter((u: any) => (u.unit?.unitStatus || u.unitStatus) === 'sold').length,
        };

        return {
          id:          entity.id,
          name:        entity.name,
          description: entity.description,
          entityType:  entity.entityType,
          status:      entity.status,
          location,
          media,
          thumbnail:   media.find((m: any) => m.mediaType === 'image')?.fileUrl || null,
          attributes,
          price:       priceDisplay,
          priceRaw:    minPrice,
          unitCount:   units.length,
          unitSummary,
        };
      })
    );

    return propertiesWithFullInfo;
  }

  // ── GET :slug/properties/:propertyId/units — unit inventory ───────────────

  @Get(':slug/properties/:propertyId/units')
  @ApiOperation({ summary: 'Get floor-wise unit inventory for a property' })
  async getPropertyUnits(
    @Param('slug')       slug:       string,
    @Param('propertyId') propertyId: string,
  ) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Agent not found');

    const unitsResult = await this.propertiesService.listUnits(
      tenant.id, { entityId: propertyId, limit: 500 }
    );

    const units = (unitsResult.data || []).map((u: any) => {
      const unit = u.unit || u;
      return {
        id:         unit.id,
        unitCode:   unit.unitCode,
        unitType:   unit.unitType,
        bhkType:    unit.bhkType,
        unitStatus: unit.unitStatus,
        price:      unit.price ? formatIndianPrice(parseFloat(unit.price)) : 'On request',
        priceRaw:   unit.price ? parseFloat(unit.price) : null,
        area:       unit.area,
        floor:      unit.floor,
      };
    });

    return units;
  }

  // ── GET :slug/prospects — smart-match client list ─────────────────────────

  @Get(':slug/prospects')
  @ApiOperation({ summary: 'Get leads for smart-match feature' })
  async getPublicProspects(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Agent not found');
    return this.tenantsService.getPublicProspects(tenant.id);
  }

  // ── POST :slug/enquiry — capture lead enquiry ─────────────────────────────

  @Post(':slug/enquiry')
  @ApiOperation({ summary: 'Submit a property enquiry — creates lead in CRM' })
  @ApiBody({ type: PublicEnquiryDto })
  async submitEnquiry(
    @Param('slug') slug: string,
    @Body() dto: PublicEnquiryDto,
  ) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant || tenant.status !== 'active') throw new NotFoundException('Agent not found');

    const settings = await this.leadAssignmentService.getSettings(tenant.id);
    if (!settings?.publicApiKey) {
      throw new BadRequestException('Lead capture not configured for this agent');
    }

    const notes = [
      dto.message          && `Message: ${dto.message}`,
      dto.propertyName     && `Interested in: ${dto.propertyName}`,
    ].filter(Boolean).join('\n') || undefined;

    return this.leadsService.captureLeadFromPublicChannel(slug, settings.publicApiKey, {
      name:               dto.name,
      phone:              dto.phone,
      email:              dto.email,
      budget:             dto.budget,
      requirementType:    'buy',
      bhkType:            dto.bhkType,
      locationPreference: dto.locationPreference,
      notes,
      leadSource:         'website',
    } as any);
  }

  // ── POST :slug/site-visit — book site visit (creates lead + visit) ─────────

  @Post(':slug/site-visit')
  @ApiOperation({ summary: 'Book a site visit — creates lead + scheduled visit in CRM' })
  @ApiBody({ type: PublicSiteVisitDto })
  async bookSiteVisit(
    @Param('slug') slug: string,
    @Body() dto: PublicSiteVisitDto,
  ) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant || tenant.status !== 'active') throw new NotFoundException('Agent not found');

    const settings = await this.leadAssignmentService.getSettings(tenant.id);
    if (!settings?.publicApiKey) {
      throw new BadRequestException('Lead capture not configured for this agent');
    }

    const notes = [
      `Site Visit Request`,
      dto.propertyName && `Property: ${dto.propertyName}`,
      dto.notes        && `Note: ${dto.notes}`,
    ].filter(Boolean).join('\n');

    // Step 1 — create / find the lead
    const leadResult: any = await this.leadsService.captureLeadFromPublicChannel(
      slug,
      settings.publicApiKey,
      {
        name:            dto.name,
        phone:           dto.phone,
        email:           dto.email,
        requirementType: 'buy',
        notes,
        leadSource:      'website',
      } as any,
    );

    const leadId = leadResult?.data?.id ?? leadResult?.id;
    if (!leadId) return { success: true, message: 'Enquiry registered. Agent will contact you shortly.' };

    // Step 2 — schedule the site visit
    await this.tenantsService.publicCreateSiteVisit(tenant.id, {
      leadId,
      propertyId: dto.propertyId,
      visitDate:  dto.visitDate,
      notes:      dto.notes,
    });

    return { success: true, message: 'Site visit booked! Agent will confirm shortly.' };
  }

  // ── GET :slug/today-visits — today's visits (authenticated agent) ──────────

  @Get(':slug/today-visits')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get today's site visits with lead + property details (agent auth required)" })
  async getTodayVisits(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Agent not found');
    return this.tenantsService.getTodayVisits(tenant.id);
  }

  // ── GET :slug/recent-leads — recent leads list (authenticated agent) ────────

  @Get(':slug/recent-leads')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent leads for agent portal (agent auth required)' })
  async getRecentLeads(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Agent not found');
    return this.tenantsService.getRecentLeads(tenant.id);
  }
}
