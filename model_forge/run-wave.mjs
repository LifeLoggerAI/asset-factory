#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const args=process.argv.slice(2);
const waveArg=args.indexOf('--wave');
if(waveArg<0||!args[waveArg+1]){console.error('usage: node model_forge/run-wave.mjs --wave <wave.json> [--execute]');process.exit(2)}
const execute=args.includes('--execute');
const wavePath=path.resolve(args[waveArg+1]);
const wave=JSON.parse(fs.readFileSync(wavePath,'utf8'));
if(wave.schemaVersion!=='urai-model-forge-wave-v1') throw new Error('unsupported wave schema');
const planned=wave.entries.reduce((n,e)=>n+(e.providers?.length??0)*(e.maxAttemptsPerProvider??1),0);
if(planned>wave.maxCandidateGenerations) throw new Error(`planned candidate attempts ${planned} exceed wave cap ${wave.maxCandidateGenerations}`);
if(execute&&process.env.URAI_MODEL_FORGE_SPEND_AUTHORIZED!=='1') throw new Error('wave execution requires URAI_MODEL_FORGE_SPEND_AUTHORIZED=1');
if(execute){
  const preflight=spawnSync(process.execPath,['model_forge/provider-preflight.mjs','--live'],{stdio:'inherit',env:process.env});
  if(preflight.status!==0) throw new Error('provider preflight failed; generation wave not started');
}
const summary={schemaVersion:'urai-model-forge-wave-receipt-v1',waveId:wave.id,execute,plannedCandidateAttempts:planned,maxCandidateGenerations:wave.maxCandidateGenerations,entries:[]};
for(const entry of wave.entries){
  const spec=JSON.parse(fs.readFileSync(entry.spec,'utf8'));
  if(spec.generation?.maxProviderAttempts!==entry.maxAttemptsPerProvider) throw new Error(`${entry.spec}: spec attempt policy does not match wave`);
  for(const provider of entry.providers){
    const required={meshy:'MESHY_API_KEY',tripo:'TRIPO_API_KEY',rodin:'RODIN_API_KEY'}[provider];
    const configured=Boolean(process.env[required]);
    if(!execute){
      summary.entries.push({assetId:spec.id,provider,status:'planned',credentialConfigured:configured});
      continue;
    }
    if(!configured){
      summary.entries.push({assetId:spec.id,provider,status:'blocked-missing-credential',requiredEnv:required});
      continue;
    }
    const result=spawnSync(process.execPath,['model_forge/forge.mjs','--spec',entry.spec,'--providers',provider],{stdio:'inherit',env:process.env});
    summary.entries.push({assetId:spec.id,provider,status:result.status===0?'executed':'failed',exitCode:result.status});
  }
}
fs.writeFileSync('model-forge-wave-receipt.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(execute&&summary.entries.some((e)=>e.status==='failed')) process.exit(1);
