'use client';
import { useEffect, useState } from 'react';
export default function JobsPage(){const [jobs,setJobs]=useState<any[]>([]);useEffect(()=>{fetch('/api/jobs').then(r=>r.json()).then(setJobs);},[]);const materialize=async(id:string)=>{await fetch(`/api/jobs/${id}/materialize`,{method:'POST'}); location.reload();};return <main><h1>Jobs</h1>{jobs.length===0?<p>No jobs</p>:<ul>{jobs.map((j:any)=><li key={j.jobId}>{j.jobId} {j.status} <button onClick={()=>materialize(j.jobId)}>Materialize</button></li>)}</ul>}</main>}
