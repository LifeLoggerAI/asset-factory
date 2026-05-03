'use client';
import { useState } from 'react';
export default function NewJobPage(){
 const [jobId,setJobId]=useState(`job-${Date.now()}`); const [prompt,setPrompt]=useState('Cinematic sky'); const [type,setType]=useState('sky/environment'); const [msg,setMsg]=useState('');
 const submit=async()=>{const r=await fetch('/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,tenantId:'local',prompt,type})}); const d=await r.json(); setMsg(JSON.stringify(d)); if(r.ok) location.href='/jobs';};
 return <main><h1>Create Job</h1><input value={jobId} onChange={e=>setJobId(e.target.value)}/><input value={type} onChange={e=>setType(e.target.value)}/><textarea value={prompt} onChange={e=>setPrompt(e.target.value)}/><button onClick={submit}>Submit</button><pre>{msg}</pre></main>
}
