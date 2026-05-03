'use client';
import { useEffect, useState } from 'react';
export default function SystemPage(){const [d,setD]=useState<any>(null);useEffect(()=>{fetch('/api/system/manifest').then(r=>r.json()).then(setD);},[]);return <main><h1>System</h1><pre>{JSON.stringify(d,null,2)}</pre></main>}
