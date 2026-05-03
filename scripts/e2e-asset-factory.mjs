import { spawn } from 'node:child_process';
const base='http://127.0.0.1:3000';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const j=async (u,o)=>{const r=await fetch(base+u,o);const t=await r.text();let b;try{b=JSON.parse(t)}catch{b=t}if(!r.ok) throw new Error(`${u} -> ${r.status} ${t}`);return b;};
const dev=spawn('bash',['-lc','cd assetfactory-studio && npm run dev'],{stdio:'ignore'});
try{let up=false;for(let i=0;i<50;i++){try{await j('/api/system/health');up=true;break;}catch{await sleep(500);}}if(!up) throw new Error('server failed to boot');
const jobId=`e2e-${Date.now()}`;await j('/api/system/manifest');await j('/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,tenantId:'e2e',prompt:'e2e prompt',type:'body/neutral'})});await j(`/api/jobs/${jobId}/materialize`,{method:'POST'});await j(`/api/jobs/${jobId}`);await j(`/api/assets/${jobId}`);await j(`/api/generated-assets/${jobId}.svg`);await j(`/api/generated-assets/${jobId}.json`);await j(`/api/jobs/${jobId}/publish`,{method:'POST'});await j(`/api/jobs/${jobId}/approve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:'approved'})});console.log('PASS E2E');
}catch(e){console.error('FAIL',e.message);process.exitCode=1;}finally{dev.kill('SIGTERM');}
