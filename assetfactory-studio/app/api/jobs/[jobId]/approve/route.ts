import { NextRequest, NextResponse } from 'next/server'; import { approveAsset } from '@/lib/server/assetFactoryStore';
export async function POST(req:NextRequest,{params}:{params:{jobId:string}}){return NextResponse.json(await approveAsset(params.jobId, await req.json()));}
