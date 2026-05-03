import { NextRequest, NextResponse } from 'next/server'; import { rollbackAsset } from '@/lib/server/assetFactoryStore';
export async function POST(req:NextRequest,{params}:{params:{jobId:string}}){const b=await req.json(); return NextResponse.json(await rollbackAsset(params.jobId,b.versionId ?? 'latest'));}
