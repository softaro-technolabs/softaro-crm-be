import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { PublicLeadCaptureDto } from './leads.dto';
import { LeadsService } from './leads.service';

@ApiTags('Lead Capture')
@Controller('public/leads')
export class LeadPublicController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post(':tenantSlug')
  @ApiOperation({
    summary: 'Capture lead via public API/Webhook',
    description: `**Public endpoint for capturing leads from external sources (website forms, ads, etc.)**
    
**🔑 How to Get Your API Key:**
1. **Login first**: POST /auth/login (get JWT token)
2. **Get settings**: GET /tenants/{tenantId}/leads/assignment/settings
   - Requires: Authorization header with "Bearer {your-jwt-token}"
   - Response includes: \`publicApiKey\` field
3. **Copy the API key** from the response

**📝 How to Use This Endpoint:**
1. Include API key in header: \`x-lead-api-key: {your-api-key}\`
2. Send POST request with lead data
3. Lead is automatically created and assigned to an agent

**⚠️ Common Errors:**
- **403 Forbidden**: Invalid or missing API key
- **404 Not Found**: Wrong tenant slug
- **500 Error**: Check server console logs for details

**🔄 Rotate API Key:**
- POST /tenants/{tenantId}/leads/assignment/settings/rotate-api-key
- **Requires authentication** (JWT token)
- Old key becomes invalid immediately

**Real-life scenarios:**
- **Website Contact Form**: Frontend calls this API when form is submitted
- **Facebook/Google Ads**: Configure webhook URL in ad platform settings
- **Third-party Integrations**: External systems push leads using this API`
  })
  @ApiParam({
    name: 'tenantSlug',
    description: 'Your tenant slug (e.g., "acme" if your tenant slug is "acme")',
    example: 'acme'
  })
  @ApiHeader({
    name: 'x-lead-api-key',
    description: 'Public API key for lead capture. Get it from assignment settings endpoint.',
    required: true,
    example: 'a1b2c3d4e5f6...'
  })
  @ApiBody({ type: PublicLeadCaptureDto })
  async capture(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: PublicLeadCaptureDto,
    @Headers('x-lead-api-key') apiKey?: string
  ) {
    return this.leadsService.captureLeadFromPublicChannel(tenantSlug, apiKey ?? null, dto);
  }
}


