'use client';
import { useEffect, useState } from 'react';
export default function AssetsPage(){const [d,setD]=useState<any[]>([]);useEffect(()=>{fetch('/api/assets').then(r=>r.json()).then(setD);},[]);return <main><h1>Assets</h1>{d.length===0?<p>No assets yet.</p>:<ul>{d.map((a:any)=><li key={a.jobId}>{a.jobId} - {a.fileName}</li>)}</ul>}</main>}
