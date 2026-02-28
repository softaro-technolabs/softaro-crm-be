import { Controller, Get, Query, Res, Req, UseGuards, Param, HttpException, HttpStatus, Delete } from '@nestjs/common';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { CalendarTokenService } from './calendar-token.service';

@Controller('tenants/:tenantId/calendar-sync')
@UseGuards(JwtAuthGuard)
export class CalendarAuthController {
    constructor(
        private readonly configService: ConfigService,
        private readonly calendarTokenService: CalendarTokenService,
        private readonly requestContext: RequestContextService
    ) { }

    private verifyTenantAccess(tenantId: string) {
        const user = this.requestContext.getUser();
        const userId = this.requestContext.getUserId();
        if (!user || !userId) throw new HttpException('User context not found', HttpStatus.FORBIDDEN);
        if (user.role_global !== 'super_admin' && user.tenant_id !== tenantId) {
            throw new HttpException('Access denied to this tenant', HttpStatus.FORBIDDEN);
        }
        return { ...user, id: userId };
    }

    // --- GOOGLE OAUTH ---

    @Get('google/auth')
    googleAuth(@Param('tenantId') tenantId: string, @Res() res: Response) {
        this.verifyTenantAccess(tenantId);

        const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
        const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

        if (!clientId || !redirectUri) {
            throw new HttpException('Google OAuth not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const scope = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email';

        // Pass tenantId via state for the callback
        const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64');

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${state}`;

        return res.json({ url: authUrl });
    }

    // Public callback endpoint (can't have JwtGuard because browser redirects here)
    @Get('google/callback')
    async googleCallback(@Query('code') code: string, @Query('state') stateBase64: string, @Res() res: Response) {
        // In a real implementation you would tie this back to the user session securely
        // For this API, the admin/frontend needs to process the redirect or we use a deep link.
        // For demonstration, we'll parse the state, but we really need the User context.

        return res.json({ message: 'Callback received. Pass this code to /connect endpoint securely.', code, state: stateBase64 });
    }

    @Get('google/connect')
    async connectGoogle(@Param('tenantId') tenantId: string, @Query('code') code: string) {
        const user = this.verifyTenantAccess(tenantId);

        const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
        const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
        const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

        try {
            const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            });

            const { access_token, refresh_token, expires_in } = tokenResponse.data;

            // Get user email array to use as accountId
            const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            const accountId = userInfoResponse.data.email;

            await this.calendarTokenService.saveToken(
                tenantId,
                user.id,
                'google',
                accountId,
                access_token,
                refresh_token,
                expires_in
            );

            return { success: true, account: accountId, provider: 'google' };
        } catch (error: any) {
            throw new HttpException(`Google Auth Failed: ${error.response?.data?.error_description || error.message}`, HttpStatus.BAD_REQUEST);
        }
    }

    // --- MICROSOFT OAUTH ---

    @Get('microsoft/auth')
    microsoftAuth(@Param('tenantId') tenantId: string, @Res() res: Response) {
        this.verifyTenantAccess(tenantId);

        const clientId = this.configService.get<string>('MS_CLIENT_ID');
        const redirectUri = this.configService.get<string>('MS_REDIRECT_URI');
        const tenant = 'common';

        if (!clientId || !redirectUri) {
            throw new HttpException('Microsoft OAuth not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const scope = 'offline_access User.Read Calendars.ReadWrite';
        const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64');

        const authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scope)}&state=${state}`;

        return res.json({ url: authUrl });
    }

    @Get('microsoft/connect')
    async connectMicrosoft(@Param('tenantId') tenantId: string, @Query('code') code: string) {
        const user = this.verifyTenantAccess(tenantId);

        const clientId = this.configService.get<string>('MS_CLIENT_ID');
        const clientSecret = this.configService.get<string>('MS_CLIENT_SECRET');
        const redirectUri = this.configService.get<string>('MS_REDIRECT_URI');
        const tenant = 'common';

        try {
            const data = new URLSearchParams();
            data.append('client_id', clientId ?? '');
            data.append('scope', 'offline_access User.Read Calendars.ReadWrite');
            data.append('code', code);
            data.append('redirect_uri', redirectUri ?? '');
            data.append('grant_type', 'authorization_code');
            data.append('client_secret', clientSecret ?? '');

            const tokenResponse = await axios.post(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, data, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token, refresh_token, expires_in } = tokenResponse.data;

            // Get user email
            const userInfoResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            const accountId = userInfoResponse.data.userPrincipalName || userInfoResponse.data.mail;

            await this.calendarTokenService.saveToken(
                tenantId,
                user.id,
                'microsoft',
                accountId,
                access_token,
                refresh_token,
                expires_in
            );

            return { success: true, account: accountId, provider: 'microsoft' };
        } catch (error: any) {
            throw new HttpException(`Microsoft Auth Failed: ${error.response?.data?.error_description || error.message}`, HttpStatus.BAD_REQUEST);
        }
    }

    @Delete(':provider')
    async disconnect(@Param('tenantId') tenantId: string, @Param('provider') provider: 'google' | 'microsoft') {
        const user = this.verifyTenantAccess(tenantId);
        await this.calendarTokenService.disconnect(tenantId, user.id, provider);
        return { success: true, message: `Disconnected ${provider} calendar` };
    }
}
