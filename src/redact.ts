import { getRedactedFields } from './env';

/**
 * Redacts sensitive headers from a headers object
 */
export function redactHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string | string[] | undefined> {
  const redactedFields = getRedactedFields();
  const redacted: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    const keyLower = key.toLowerCase();
    if (redactedFields.includes(keyLower)) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Redacts sensitive fields from a body object (for future use)
 */
export function redactBody(
  body: unknown,
  contentType: string | undefined,
  fields: string[] = []
): unknown {
  if (!contentType || !contentType.includes('application/json')) {
    return body;
  }

  if (typeof body !== 'object' || body === null) {
    return body;
  }

  const redacted = Array.isArray(body) ? [...body] : { ...body };

  for (const field of fields) {
    if (field in redacted) {
      (redacted as Record<string, unknown>)[field] = '[REDACTED]';
    }
  }

  return redacted;
}

