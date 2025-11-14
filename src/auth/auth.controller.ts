import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, CreateSuperAdminDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthJwtPayload } from './auth.utils';
import { UsersService } from '../users/users.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  @Post('create-super-admin')
  @ApiOperation({ summary: 'Create the first super admin (initial setup only)' })
  @ApiOkResponse({ description: 'Super admin created successfully' })
  async createSuperAdmin(@Body() dto: CreateSuperAdminDto) {
    const user = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      phone: dto.phone,
      roleGlobal: 'super_admin'
    });

    return {
      message: 'Super admin created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleGlobal: user.roleGlobal
      }
    };
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login for all users (Super Admin & Normal Users)',
    description: 'Single login endpoint for all users. Super admin can login with or without tenant slug. Normal users must provide tenant slug.'
  })
  @ApiOkResponse({
    description: 'Returns access token, refresh token and authorization context'
  })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({ description: 'Returns a new token pair' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user context' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: { user: AuthJwtPayload }) {
    return this.authService.me(req.user);
  }
}

