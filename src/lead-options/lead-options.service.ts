import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import { leadOptions } from '../database/schema';
import { CreateLeadOptionDto, ListLeadOptionsDto, UpdateLeadOptionDto, LeadOptionType } from './lead-options.dto';

const DEFAULTS: Record<LeadOptionType, { label: string; value: string }[]> = {
  requirement_type: [
    { label: 'Buy',        value: 'buy'        },
    { label: 'Rent',       value: 'rent'       },
    { label: 'Investment', value: 'investment' },
  ],
  property_type: [
    { label: 'Apartment',   value: 'apartment'   },
    { label: 'Villa',       value: 'villa'       },
    { label: 'Plot',        value: 'plot'        },
    { label: 'Penthouse',   value: 'penthouse'   },
    { label: 'Studio',      value: 'studio'      },
    { label: 'Row House',   value: 'row_house'   },
    { label: 'Shop',        value: 'shop'        },
    { label: 'Office',      value: 'office'      },
    { label: 'Warehouse',   value: 'warehouse'   },
  ],
  property_category: [
    { label: 'Residential',  value: 'residential'  },
    { label: 'Commercial',   value: 'commercial'   },
    { label: 'Industrial',   value: 'industrial'   },
    { label: 'Agricultural', value: 'agricultural' },
  ],
  capture_channel: [
    { label: 'Website',           value: 'website'           },
    { label: 'Google Ads',        value: 'google_ads'        },
    { label: 'Facebook Ads',      value: 'facebook_ads'      },
    { label: 'WhatsApp',          value: 'whatsapp'          },
    { label: 'Phone Call',        value: 'phone_call'        },
    { label: 'Walk-In',           value: 'walk_in'           },
    { label: 'Referral',          value: 'referral'          },
    { label: 'Email Campaign',    value: 'email_campaign'    },
    { label: 'IVR',               value: 'ivr'               },
    { label: '99acres',           value: '99acres'           },
    { label: 'MagicBricks',       value: 'magicbricks'       },
    { label: 'Housing.com',       value: 'housing_com'       },
  ],
};

@Injectable()
export class LeadOptionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async list(tenantId: string, query: ListLeadOptionsDto) {
    const conditions = [eq(leadOptions.tenantId, tenantId)];

    if (query.type) {
      conditions.push(eq(leadOptions.type, query.type));
    }
    if (query.activeOnly !== false) {
      conditions.push(eq(leadOptions.isActive, true));
    }

    return this.db
      .select()
      .from(leadOptions)
      .where(and(...conditions))
      .orderBy(asc(leadOptions.order), asc(leadOptions.label));
  }

  async create(tenantId: string, dto: CreateLeadOptionDto) {
    // Prevent duplicate value within same tenant+type
    const [existing] = await this.db
      .select()
      .from(leadOptions)
      .where(
        and(
          eq(leadOptions.tenantId, tenantId),
          eq(leadOptions.type, dto.type),
          eq(leadOptions.value, dto.value),
        ),
      )
      .limit(1);

    if (existing) {
      throw new BadRequestException(`Option with value "${dto.value}" already exists for this type.`);
    }

    const id = randomUUID();
    await this.db.insert(leadOptions).values({
      id,
      tenantId,
      type: dto.type,
      label: dto.label,
      value: dto.value,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    });

    const [created] = await this.db
      .select()
      .from(leadOptions)
      .where(eq(leadOptions.id, id))
      .limit(1);

    return created;
  }

  async update(tenantId: string, id: string, dto: UpdateLeadOptionDto) {
    const [option] = await this.db
      .select()
      .from(leadOptions)
      .where(and(eq(leadOptions.id, id), eq(leadOptions.tenantId, tenantId)))
      .limit(1);

    if (!option) throw new BadRequestException('Option not found');

    const updateData: Partial<typeof leadOptions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.label   !== undefined) updateData.label   = dto.label;
    if (dto.value   !== undefined) updateData.value   = dto.value;
    if (dto.order   !== undefined) updateData.order   = dto.order;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    await this.db
      .update(leadOptions)
      .set(updateData)
      .where(eq(leadOptions.id, id));

    const [updated] = await this.db
      .select()
      .from(leadOptions)
      .where(eq(leadOptions.id, id))
      .limit(1);

    return updated;
  }

  async delete(tenantId: string, id: string) {
    const [option] = await this.db
      .select()
      .from(leadOptions)
      .where(and(eq(leadOptions.id, id), eq(leadOptions.tenantId, tenantId)))
      .limit(1);

    if (!option) throw new BadRequestException('Option not found');

    await this.db.delete(leadOptions).where(eq(leadOptions.id, id));
  }

  /**
   * Seeds the default options for every type for this tenant.
   * Skips values that already exist (idempotent).
   */
  async seedDefaults(tenantId: string) {
    const seeded: string[] = [];

    for (const [type, items] of Object.entries(DEFAULTS) as [LeadOptionType, typeof DEFAULTS[LeadOptionType]][]) {
      for (let i = 0; i < items.length; i++) {
        const { label, value } = items[i];

        const [existing] = await this.db
          .select()
          .from(leadOptions)
          .where(
            and(
              eq(leadOptions.tenantId, tenantId),
              eq(leadOptions.type, type),
              eq(leadOptions.value, value),
            ),
          )
          .limit(1);

        if (!existing) {
          await this.db.insert(leadOptions).values({
            id: randomUUID(),
            tenantId,
            type,
            label,
            value,
            order: i,
            isActive: true,
          });
          seeded.push(`${type}:${value}`);
        }
      }
    }

    return { seeded: seeded.length, items: seeded };
  }
}
