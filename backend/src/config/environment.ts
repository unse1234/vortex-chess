import { z } from 'zod';
const flag = z.enum(['true', 'false']).transform((v) => v === 'true');
const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (v) => /^postgres(ql)?:/.test(v),
        'Use a PostgreSQL connection URL',
      ),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32)
      .refine(
        (v) => !/change.?me|placeholder|generate_a_random|your_secret/i.test(v),
        'Generate a random signing secret',
      ),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((v) => v.split(',').map((s) => s.trim())),
    COOKIE_SECURE: flag.default(false),
    MATCHMAKING_ENABLED: flag.default(true),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(900)
      .default(300),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(24),
    REMEMBER_SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    /** Frontend base URL used in emailed links; defaults to the first CORS origin. */
    APP_PUBLIC_URL: z.string().url().optional(),
    ROOM_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),
    INVITATION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
    MAX_ACTIVE_ROOMS_PER_USER: z.coerce.number().int().min(1).max(50).default(5),
    /** 0 disables the background sweep; expiry is still enforced by every operation. */
    EXPIRY_SWEEP_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(3600)
      .default(30),
    REALTIME_SESSION_CHECK_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(900)
      .default(60),
    REALTIME_MAX_SOCKETS_PER_USER: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10),
    /** Lifetime of an emailed password reset link. */
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    /** Minimum gap between reset emails for one account; requests inside it are silently ignored. */
    PASSWORD_RESET_COOLDOWN_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(3600)
      .default(60),
    /** Reset emails per account per rolling hour. */
    PASSWORD_RESET_MAX_PER_HOUR: z.coerce.number().int().min(1).max(20).default(5),
    MAIL_TRANSPORT: z.enum(['disabled', 'smtp']).default('disabled'),
    MAIL_FROM: z.string().min(3).max(254).optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    /** true = implicit TLS (usually port 465); false = STARTTLS when offered. */
    SMTP_SECURE: flag.default(false),
    /** Refuse to send without TLS unless explicitly disabled for a local test relay. */
    SMTP_REQUIRE_TLS: flag.default(true),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    /** 0 disables the in-process worker; queued jobs remain pending. */
    MAIL_WORKER_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(3600)
      .default(10),
    MAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    MAIL_RETRY_BASE_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(30),
    MAIL_LEASE_SECONDS: z.coerce.number().int().min(10).max(3600).default(120),
    /** Engine service (FastAPI over HTTP/JSON). Unset disables engine games. */
    ENGINE_BASE_URL: z.string().url().optional(),
    /** Search time requested per engine move; shortened when the engine's clock requires it. */
    ENGINE_SEARCH_MOVETIME_MS: z.coerce.number().int().min(10).max(30000).default(200),
    /** Clock time kept back for HTTP travel and engine-service queueing. */
    ENGINE_TRANSPORT_RESERVE_MS: z.coerce.number().int().min(0).max(30000).default(1500),
    /** Clock time kept back for validating and committing the returned move. */
    ENGINE_COMMIT_RESERVE_MS: z.coerce.number().int().min(0).max(5000).default(150),
    /** Upper bound for one analyze request, whatever the clock allows. */
    ENGINE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(10000),
    ENGINE_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(3000),
    /** Searches in flight against the engine service at once, across all games. */
    ENGINE_MAX_CONCURRENT_SEARCHES: z.coerce.number().int().min(1).max(64).default(1),
    /** Searches waiting for a slot; more are refused as busy. */
    ENGINE_MAX_QUEUED_SEARCHES: z.coerce.number().int().min(0).max(1000).default(16),
    /** Admission limit: active engine games across the server. */
    ENGINE_MAX_ACTIVE_GAMES: z.coerce.number().int().min(1).max(1000).default(4),
    /** Attempts per engine move, counting the first; only transient failures are retried. */
    ENGINE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    ENGINE_RETRY_BASE_MS: z.coerce.number().int().min(0).max(10000).default(300),
    /** After an aborted or timed-out request, the slot stays reserved this long: the remote search may still be running. */
    ENGINE_ABORT_QUARANTINE_MS: z.coerce.number().int().min(0).max(60000).default(2000),
    /** Periodic repair of missed engine turns; 0 disables (commits and startup still schedule). */
    ENGINE_RECOVERY_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(5),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === 'smtp') {
      for (const key of ['MAIL_FROM', 'SMTP_HOST'] as const)
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when MAIL_TRANSPORT=smtp',
          });
      if (!!env.SMTP_USER !== !!env.SMTP_PASSWORD)
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_PASSWORD'],
          message: 'Set SMTP_USER and SMTP_PASSWORD together',
        });
      if (env.NODE_ENV === 'production' && !env.SMTP_REQUIRE_TLS)
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_REQUIRE_TLS'],
          message: 'TLS is required for SMTP in production',
        });
    }
    if (env.APP_PUBLIC_URL) {
      const parsed = new URL(env.APP_PUBLIC_URL);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.search ||
        parsed.hash ||
        (env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
      )
        ctx.addIssue({
          code: 'custom',
          path: ['APP_PUBLIC_URL'],
          message:
            'Use an http(s) URL without credentials, query or fragment; HTTPS is required in production',
        });
    }
    for (const origin of env.CORS_ORIGINS) {
      try {
        const parsed = new URL(origin);
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          parsed.origin !== origin
        )
          throw new Error();
        if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
          throw new Error();
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message:
            'Use explicit origins, without paths, wildcards or trailing slashes; HTTPS is required in production',
        });
      }
    }
    if (env.ENGINE_BASE_URL) {
      const parsed = new URL(env.ENGINE_BASE_URL);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.search ||
        parsed.hash ||
        parsed.username ||
        (env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
      )
        ctx.addIssue({
          code: 'custom',
          path: ['ENGINE_BASE_URL'],
          message:
            'Use an http(s) base URL without credentials, query or fragment; HTTPS is required in production',
        });
    }
    if (
      env.ENGINE_REQUEST_TIMEOUT_MS <
      env.ENGINE_SEARCH_MOVETIME_MS + env.ENGINE_TRANSPORT_RESERVE_MS
    )
      ctx.addIssue({
        code: 'custom',
        path: ['ENGINE_REQUEST_TIMEOUT_MS'],
        message:
          'Must cover ENGINE_SEARCH_MOVETIME_MS plus ENGINE_TRANSPORT_RESERVE_MS',
      });
    if (
      (env.COOKIE_SAME_SITE === 'none' || env.NODE_ENV === 'production') &&
      !env.COOKIE_SECURE
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Secure cookies required for production or SameSite=None',
      });
    }
  });
export type Environment = z.infer<typeof schema>;
export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Report field names, never environment values or credentials.
    throw new Error(
      `Invalid environment: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}
