#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

async function getJson(url, token){
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
  const text=await response.text();
  let payload={};
  try{payload=text?JSON.parse(text):{}}catch{payload={raw:text}}
  if(!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload).slice(0,500)}`);
  return payload;
}

const checks=[
  {provider:'meshy',env:'MESHY_API_KEY',url:'https://api.meshy.ai/openapi/v1/balance',read:(p)=>({balance:p.balance??null})},
  {provider:'tripo',env:'TRIPO_API_KEY',url:'https://api.tripo3d.ai/v2/openapi/user/balance',read:(p)=>{
    if(p.code!==0) throw new Error(`Tripo code ${p.code}: ${p.message??'unknown'}`);
    return {balance:p.data?.balance??null,frozen:p.data?.frozen??null};
  }},
  {provider:'rodin',env:'RODIN_API_KEY',url:null,read:null,note:'Credential presence only; current generation response records consumed credits. Balance URL is intentionally not guessed.'},
  {provider:'replicate',env:'REPLICATE_API_TOKEN',url:null,read:null,note:'Credential presence only in this forge; existing Asset Factory Replicate runtime owns provider billing.'}
];
const live=process.argv.includes('--live');
const receipt={schemaVersion:'urai-model-provider-preflight-v1',live,providers:[]};
for(const check of checks){
  const configured=Boolean(process.env[check.env]);
  const row={provider:check.provider,requiredEnv:check.env,configured,balanceChecked:false};
  if(live&&configured&&check.url){
    try{
      const payload=await getJson(check.url,process.env[check.env]);
      Object.assign(row,check.read(payload),{balanceChecked:true,status:'reachable'});
    }catch(error){Object.assign(row,{status:'preflight-failed',error:String(error?.message??error)})}
  }else{
    row.status=configured?'configured-not-queried':'blocked-missing-credential';
    if(check.note) row.note=check.note;
  }
  receipt.providers.push(row);
}
fs.writeFileSync('model-forge-provider-preflight.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if(live&&receipt.providers.some((p)=>p.configured&&p.status==='preflight-failed')) process.exit(1);
