'use client';
import { useEffect, useState } from 'react';
export default function DashboardPage(){const [m,setM]=useState<any>(null);useEffect(()=>{fetch('/api/dashboard').then(r=>r.json()).then(setM);},[]);return <main><h1>Dashboard</h1><pre>{JSON.stringify(m,null,2)}</pre></main>}
