import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  DATABASE_URL: z.string().default('file:./data/db.sqlite'),
  ADMIN_TOKEN: z.string().min(1, 'ADMIN_TOKEN is required'),
  MAX_BODY_BYTES: z.coerce.number().default(10485760), // 10 MB
  UPLOAD_DIR: z.string().default('/data/uploads'),
  REDACTED_FIELDS: z.string().optional().default('authorization,cookie,x-api-key'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env | null = null;

export function getEnv(): Env {
  if (env) {
    return env;
  }

  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Environment validation failed: ${missing}`);
    }
    throw error;
  }
}

export function getRedactedFields(): string[] {
  const env = getEnv();
  return env.REDACTED_FIELDS.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean);
}

