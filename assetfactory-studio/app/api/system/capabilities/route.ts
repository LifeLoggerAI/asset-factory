import { NextResponse } from 'next/server'; export async function GET(){return NextResponse.json({ok:true,capabilities:['generate','materialize','publish','approve','rollback']});}
