export type AssetJobRequest = { version: '1.0'; prompt: string; tenantId?: string; presetId?: string; type?: string };
export const AssetJobRequestValidator = {
  safeParse(input: any) {
    const ok = input && input.version === '1.0' && typeof input.prompt === 'string' && input.prompt.trim().length > 0;
    return ok ? { success: true, data: input as AssetJobRequest } : { success: false, error: { message: 'Invalid asset job request' } };
  }
};
