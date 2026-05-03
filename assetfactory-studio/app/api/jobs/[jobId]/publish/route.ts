import { NextRequest, NextResponse } from 'next/server'; import { publishAsset } from '@/lib/server/assetFactoryStore';
export async function POST(_req:NextRequest,{params}:{params:{jobId:string}}){const a=await publishAsset(params.jobId); if(!a) return NextResponse.json({error:'Asset not found'},{status:404}); return NextResponse.json({ok:true,asset:a});}
