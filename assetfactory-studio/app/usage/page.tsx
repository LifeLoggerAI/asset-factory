'use client';
import { useEffect, useState } from 'react';
export default function UsagePage(){const [u,setU]=useState<any>(null);useEffect(()=>{fetch('/api/usage').then(r=>r.json()).then(setU)},[]);return <main><h1>Usage</h1><pre>{JSON.stringify(u,null,2)}</pre></main>}
