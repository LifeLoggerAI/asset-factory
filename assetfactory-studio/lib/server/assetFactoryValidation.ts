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

export function validateJobId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 2 && v.length < 128 && safe.test(v);
}
export function validateTenantId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length < 128;
}
export function validateFileName(v: unknown): v is string {
  return typeof v === 'string' && safe.test(v) && !v.includes('..');
}
export function validateGenerateRequest(v: unknown): string | null {
  if (!v || typeof v !== 'object') return 'body required';
  const body = v as Record<string, unknown>;
  if (!validateJobId(body.jobId)) return 'invalid jobId';
  if (!validateTenantId((body.tenantId as string | undefined) ?? 'default')) return 'invalid tenantId';
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) return 'invalid prompt';
  if (typeof body.type !== 'string' || !body.type.trim()) return 'invalid type';
  return null;
}
