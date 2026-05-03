import { NextResponse } from 'next/server';
import { readJobs } from '@/lib/server/assetFactoryStore';
export async function GET(){const jobs=await readJobs();const total=jobs.length;const complete=jobs.filter((j:any)=>j.status==='materialized').length;return NextResponse.json({jobsPerMinute:total/5,failureRate:0,dlqSize:0,avgCostPerJob:0,avgProcessingTimeMs:0,total,complete});}
