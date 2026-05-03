import { NextRequest, NextResponse } from 'next/server';
import { addJob, getStoreDiagnostics, materializeAsset, readJobs } from '@/lib/server/assetFactoryStore';

export async function GET(){return NextResponse.json(await readJobs());}
export async function POST(req:NextRequest){const body=await req.json(); if(!body?.jobId||!body?.prompt){return NextResponse.json({error:'jobId and prompt required'},{status:400});} const job={...body,status:'queued',createdAt:new Date().toISOString()}; await addJob(job); const d=getStoreDiagnostics(); return NextResponse.json({ok:true,jobId:job.jobId,status:job.status,persistenceMode:d.mode,fallbackActive:d.fallbackActive},{status:202});}
