import { NextResponse } from 'next/server';
import { getStoreDiagnostics } from '@/lib/server/assetFactoryStore';
export async function GET(){const d=getStoreDiagnostics();return NextResponse.json({ok:true,persistenceMode:d.mode,fallbackActive:d.fallbackActive,rendererMode:'svg-proof',firebaseProjectId:d.firebase.projectId,storageBucket:d.firebase.storageBucket});}
