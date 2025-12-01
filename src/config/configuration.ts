const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<string, string | undefined>;

export default () => ({
  nodeEnv: env.NODE_ENV ?? 'development',
  port: Number(env.PORT ?? 3000),
  database: {
    url: env.DATABASE_URL ?? '',
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    user: env.DB_USER ?? 'postgres',
    password: env.DB_PASSWORD ?? '',
    name: env.DB_NAME ?? 'softaro_crm'
  },
  jwt: {
    secret: env.JWT_SECRET ?? 'change-me',
    expiresIn: env.JWT_EXPIRES_IN ?? '1h',
    refreshSecret: env.JWT_REFRESH_SECRET ?? env.JWT_SECRET ?? 'change-me-refresh',
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN ?? '7d'
  },
  security: {
    hashRounds: Number(env.HASH_ROUNDS ?? 12)
  },
  features: {
    autoMigrate: (env.AUTO_MIGRATE ?? '1') !== '0'
  }
});

