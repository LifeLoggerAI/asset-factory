import { NextRequest, NextResponse } from 'next/server'; import { findJob, updateJob } from '@/lib/server/assetFactoryStore';
export async function GET(_req:NextRequest,{params}:{params:{jobId:string}}){const j=await findJob(params.jobId); if(!j) return NextResponse.json({error:'Job not found'},{status:404}); return NextResponse.json(j);}
export async function PATCH(req:NextRequest,{params}:{params:{jobId:string}}){const p=await req.json(); const j=await updateJob(params.jobId,p); if(!j) return NextResponse.json({error:'Job not found'},{status:404}); return NextResponse.json(j);}
