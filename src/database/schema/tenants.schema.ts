import {
  pgTable,
  varchar,
  timestamp,
  uniqueIndex,
  pgEnum,
  jsonb
} from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'cancelled']);

export const tenants = pgTable(
  'tenants',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    
    // Website Branding
    logo: varchar('logo', { length: 500 }),
    description: varchar('description', { length: 1000 }),
    primaryColor: varchar('primary_color', { length: 20 }),
    secondaryColor: varchar('secondary_color', { length: 20 }),
    
    // Contact Info
    contactEmail: varchar('contact_email', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 50 }),
    address: varchar('address', { length: 500 }),
    
    // Social & Config
    socialLinks: jsonb('social_links').$type<{
      facebook?: string;
      instagram?: string;
      twitter?: string;
      linkedin?: string;
      youtube?: string;
    }>(),
    websiteConfig: jsonb('website_config').$type<{
      heroTitle?: string;
      heroSubtitle?: string;
      showProperties?: boolean;
      features?: string[];
    }>(),

    plan: varchar('plan', { length: 100 }),
    status: tenantStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    slugUnique: uniqueIndex('tenants_slug_uq').on(table.slug)
  })
);

