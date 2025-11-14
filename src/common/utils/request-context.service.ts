import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  tenantId: string | null;
  userId: string | null;
  roleId: string | null;
  permissions: string[];
  roleGlobal: 'super_admin' | 'normal' | null;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run(context: RequestContext, callback: () => void) {
    this.storage.run(context, callback);
  }

  get<T extends keyof RequestContext>(key: T): RequestContext[T] | null {
    const store = this.storage.getStore();
    return (store && store[key]) ?? null;
  }

  set(partial: Partial<RequestContext>) {
    const store = this.storage.getStore();
    if (!store) return;
    Object.assign(store, partial);
  }

  getTenantId() {
    return this.get('tenantId');
  }

  getUserId() {
    return this.get('userId');
  }

  getPermissions() {
    return this.get('permissions') ?? [];
  }

  getUser() {
    const store = this.storage.getStore();
    if (!store) return null;
    return {
      tenant_id: store.tenantId,
      role_id: store.roleId,
      role_global: store.roleGlobal,
      permissions: store.permissions
    };
  }
}

