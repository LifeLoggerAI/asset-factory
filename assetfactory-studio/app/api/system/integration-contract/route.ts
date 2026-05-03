import { NextResponse } from 'next/server'; export async function GET(){return NextResponse.json({ok:true,targets:['urai-studio','urai-spatial','urai-jobs']});}
