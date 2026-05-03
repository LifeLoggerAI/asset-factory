import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  return NextResponse.json({ ok: true, status: 'integrity-check-disabled', reason: 'engine integrity checker export unavailable in studio runtime' });
}
