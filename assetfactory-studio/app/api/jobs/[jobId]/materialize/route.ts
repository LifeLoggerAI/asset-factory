import { NextRequest, NextResponse } from 'next/server'; import { materializeAsset } from '@/lib/server/assetFactoryStore';
export async function POST(_req:NextRequest,{params}:{params:{jobId:string}}){const a=await materializeAsset(params.jobId); if(!a) return NextResponse.json({error:'Job not found'},{status:404}); return NextResponse.json({ok:true,asset:a});}
