import { SQL, and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface FilterConfig {
  field: PgColumn | string;
  value: any;
  operator?: 'eq' | 'ilike' | 'in';
}

export interface SearchConfig {
  fields: (PgColumn | string)[];
  term: string;
}

/**
 * Common pagination utility for building paginated queries
 */
export class PaginationUtil {
  /**
   * Calculate pagination offset from page and limit
   */
  static getOffset(page: number = 1, limit: number = 50): number {
    return (page - 1) * limit;
  }

  /**
   * Build pagination metadata
   */
  static buildMeta(total: number, page: number, limit: number): PaginationMeta {
    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1
    };
  }

  /**
   * Build order by clause from sort options
   */
  static buildOrderBy(
    defaultSortBy: PgColumn,
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc',
    allowedSortFields?: Record<string, PgColumn>
  ) {
    if (sortBy && allowedSortFields && allowedSortFields[sortBy]) {
      return sortOrder === 'asc' 
        ? asc(allowedSortFields[sortBy])
        : desc(allowedSortFields[sortBy]);
    }
    
    return sortOrder === 'asc' 
      ? asc(defaultSortBy)
      : desc(defaultSortBy);
  }

  /**
   * Build search filter for multiple fields
   */
  static buildSearchFilter(config: SearchConfig): SQL | null {
    if (!config.term || !config.fields.length) {
      return null;
    }

    const term = `%${config.term}%`;
    const conditions = config.fields
      .map((field) => {
        if (typeof field === 'string') {
          return null;
        }
        return ilike(field, term);
      })
      .filter((condition): condition is SQL => condition !== null);

    if (conditions.length === 0) {
      return null;
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return or(...conditions) as SQL;
  }

  /**
   * Build filter conditions
   */
  static buildFilters(
    baseFilters: SQL[],
    additionalFilters?: FilterConfig[]
  ): SQL | null {
    const allFilters = [...baseFilters];

    if (additionalFilters) {
      for (const filter of additionalFilters) {
        if (filter.value === undefined || filter.value === null) {
          continue;
        }

        if (typeof filter.field === 'string') {
          continue;
        }

        switch (filter.operator || 'eq') {
          case 'eq':
            allFilters.push(eq(filter.field, filter.value));
            break;
          case 'ilike':
            allFilters.push(ilike(filter.field, `%${filter.value}%`));
            break;
          case 'in':
            if (Array.isArray(filter.value)) {
              // For 'in' operator, we need to handle it differently
              // This is a simplified version - you may need to adjust based on your needs
              continue;
            }
            break;
        }
      }
    }

    if (allFilters.length === 0) {
      return null;
    }

    if (allFilters.length === 1) {
      return allFilters[0];
    }

    let whereClause = allFilters[0];
    for (let i = 1; i < allFilters.length; i += 1) {
      whereClause = and(whereClause, allFilters[i]) as SQL;
    }

    return whereClause;
  }

  /**
   * Build complete paginated query result
   */
  static buildPaginatedResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
  ): PaginatedResult<T> {
    return {
      data,
      meta: this.buildMeta(total, page, limit)
    };
  }
}

