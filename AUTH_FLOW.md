# Complete Authentication Flow Documentation

## Overview
This document describes the complete authentication and authorization flow for the multi-tenant CRM system.

## Flow Sequence

### 1. Initial Setup - Create Super Admin
**Endpoint:** `POST /auth/create-super-admin`

This is the first step to initialize the system. Creates a super admin user who can manage tenants.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "StrongPass!123",
  "name": "Super Admin",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "message": "Super admin created successfully",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Super Admin",
    "roleGlobal": "super_admin"
  }
}
```

### 2. Login as Super Admin
**Endpoint:** `POST /auth/login`

Login with super admin credentials. No tenant slug required for super admin.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "StrongPass!123"
}
```

**Response:** Returns JWT tokens and user context.

### 3. Create Tenant (Super Admin Only)
**Endpoint:** `POST /tenants`

**Authorization:** Requires super admin role (SuperAdminGuard)

**Request:**
```json
{
  "name": "Acme Corporation",
  "slug": "acme",
  "plan": "premium",
  "status": "active"
}
```

**Response:** Returns created tenant object.

### 4. Create Roles in Tenant
**Endpoint:** `POST /tenants/:tenantId/roles`

**Authorization:** Requires JWT token. Super admin can access any tenant, normal users can only access their own tenant.

**Request:**
```json
{
  "name": "Manager",
  "isAdmin": false,
  "permissionIds": ["permission-id-1", "permission-id-2"]
}
```

**Note:** First, get available permissions from `GET /permissions` to get permission IDs.

### 5. Register User in Tenant
**Endpoint:** `POST /tenants/:tenantId/users/register`

**Authorization:** Requires JWT token. Super admin can register users in any tenant.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "StrongPass!123",
  "name": "John Doe",
  "phone": "+1234567890",
  "roleId": "role-uuid-here",
  "status": "active"
}
```

**Response:** Returns user with tenant membership and role information.

### 6. Login as Tenant User
**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "StrongPass!123",
  "tenantSlug": "acme"
}
```

**Response:** Returns JWT tokens with tenant context, role, and permissions.

## API Endpoints Summary

### Authentication
- `POST /auth/create-super-admin` - Create super admin (no auth required)
- `POST /auth/login` - Login with email/password
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user context

### Tenants (Super Admin Only)
- `POST /tenants` - Create tenant
- `GET /tenants` - List all tenants
- `GET /tenants/:id` - Get tenant by ID
- `PUT /tenants/:id` - Update tenant

### Roles
- `POST /tenants/:tenantId/roles` - Create role in tenant
- `GET /tenants/:tenantId/roles` - List roles in tenant
- `GET /tenants/:tenantId/roles/:roleId` - Get role by ID
- `PUT /tenants/:tenantId/roles/:roleId` - Update role
- `DELETE /tenants/:tenantId/roles/:roleId` - Delete role

### Users
- `POST /tenants/:tenantId/users/register` - Register user in tenant
- `GET /tenants/:tenantId/users` - List users in tenant
- `GET /tenants/:tenantId/users/:userId` - Get user in tenant
- `PUT /tenants/:tenantId/users/:userId` - Update user membership

### Permissions
- `GET /permissions` - List all permissions with IDs
- `GET /permissions/codes` - List all permission codes
- `GET /permissions/role/:tenantId/:roleId` - Get permissions for role

## Authorization Rules

1. **Super Admin:**
   - Can create/manage tenants
   - Can access any tenant
   - Has all permissions automatically
   - Protected by `SuperAdminGuard`

2. **Normal Users:**
   - Can only access their own tenant
   - Permissions are based on assigned role
   - Must provide tenant slug when logging in

3. **Tenant Access:**
   - Super admin can access any tenant
   - Normal users can only access tenant they belong to
   - Verified in controllers using `verifyTenantAccess()` method

## Dynamic Features

1. **Dynamic Roles:** Roles are created per tenant with custom names and permissions
2. **Dynamic Permissions:** Permissions are assigned to roles dynamically
3. **Dynamic User Assignment:** Users can be assigned different roles in different tenants
4. **Dynamic Tenant Modules:** Each tenant can have different modules enabled/disabled

## Security Features

1. **Password Hashing:** Uses bcrypt with configurable salt rounds
2. **JWT Tokens:** Access and refresh tokens for authentication
3. **Role-Based Access Control:** Permissions checked via guards
4. **Tenant Isolation:** Users can only access their assigned tenants
5. **Super Admin Protection:** Critical operations protected by SuperAdminGuard

## Database Schema

- **users:** Global user accounts
- **tenants:** Tenant/organization records
- **user_tenants:** Many-to-many relationship between users and tenants
- **roles:** Roles defined per tenant
- **permissions:** Global permission definitions
- **role_permissions:** Many-to-many relationship between roles and permissions

## Example Workflow

1. Create super admin → `POST /auth/create-super-admin`
2. Login as super admin → `POST /auth/login`
3. Create tenant "Acme" → `POST /tenants` (with super admin token)
4. Get available permissions → `GET /permissions` (to get permission IDs)
5. Create "Manager" role → `POST /tenants/{acme-id}/roles` (with permission IDs)
6. Register user → `POST /tenants/{acme-id}/users/register` (with role ID)
7. Login as user → `POST /auth/login` (with tenant slug)



