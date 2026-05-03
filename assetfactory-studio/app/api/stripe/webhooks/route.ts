import { NextRequest, NextResponse } from 'next/server';
export async function POST(_req:NextRequest){return NextResponse.json({received:true,mode:'stub-safe-no-stripe-secret'});}
