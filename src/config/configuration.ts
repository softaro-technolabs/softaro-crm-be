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
  rbac: {
    /**
     * `enforce` — deny requests missing the required permission.
     * `audit`   — allow them but log what would have been denied, so an existing
     *             deployment can be validated against real traffic before the switch.
     */
    // Defaults to `audit` deliberately: existing roles were configured while
    // permissions were unenforced, so switching straight to `enforce` would lock
    // real users out of pages they use today. Run audit, review the warnings,
    // fix the roles, then set RBAC_MODE=enforce.
    mode: env.RBAC_MODE === 'enforce' ? 'enforce' : 'audit'
  },
  features: {
    autoMigrate: (env.AUTO_MIGRATE ?? '1') !== '0',
    keepAlive: {
      enabled: (env.KEEP_ALIVE_ENABLED ?? '1') !== '0',
      intervalMinutes: Number(env.KEEP_ALIVE_INTERVAL_MINUTES ?? 10),
      pingUrl: env.KEEP_ALIVE_PING_URL ?? ''
    }
  },
  mail: {
    // No fallback: an API key must come from the environment. A hardcoded default
    // ends up in git history and, once pushed, is public.
    apiKey: env.RESEND_API_KEY ?? '',
    from: "Sureplot <no-reply@sureplot.in>",
    frontendUrl: env.FRONTEND_URL ?? 'https://sureplot.in'
  },
  groq: {
    apiKey: env.GROQ_API_KEY
  }
});
