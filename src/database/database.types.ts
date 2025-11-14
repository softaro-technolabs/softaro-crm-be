import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from './schema';

export type DrizzleDatabase = MySql2Database<typeof schema>;



