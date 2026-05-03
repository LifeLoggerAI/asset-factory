import { NextResponse } from 'next/server'; import { readJobs } from '@/lib/server/assetFactoryStore';
export async function GET(){return NextResponse.json(await readJobs());}
