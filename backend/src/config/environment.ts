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
  })
  .superRefine((env, ctx) => {
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
