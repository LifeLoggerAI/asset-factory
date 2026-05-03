import { NextResponse } from 'next/server'; import { listAssets } from '@/lib/server/assetFactoryStore'; export async function GET(){return NextResponse.json(await listAssets());}
