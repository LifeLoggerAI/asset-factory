const safe = /^[a-zA-Z0-9._/-]+$/;

export type GenerateRequest = {
  jobId: string;
  tenantId?: string;
  prompt: string;
  type: string;
  presetId?: string;
  transparentBackground?: boolean;
  metadata?: Record<string, unknown>;
};

export function validateJobId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 2 &&
    value.length < 128 &&
    safe.test(value)
  );
}

export function validateTenantId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length < 128;
}

export function validateFileName(value: unknown): value is string {
  return typeof value === 'string' && safe.test(value) && !value.includes('..');
}

export function validateGenerateRequest(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return 'body required';
  }

  const body = value as Record<string, unknown>;

  if (!validateJobId(body.jobId)) {
    return 'invalid jobId';
  }

  if (!validateTenantId((body.tenantId as string | undefined) ?? 'default')) {
    return 'invalid tenantId';
  }

  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return 'invalid prompt';
  }

  if (typeof body.type !== 'string' || !body.type.trim()) {
    return 'invalid type';
  }

  return null;
}