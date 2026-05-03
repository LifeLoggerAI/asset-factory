import { randomUUID } from 'node:crypto';
import { getAdminBucket, getAdminDb, getFirebaseDiagnostics, isFirebaseAdminAvailable } from './firebaseAdmin';
import { localAddJob, localFindAsset, localFindJob, localListAssets, localReadGenerated, localReadJobs, localUpdateJob, localUpsertAsset, localWriteGenerated } from './localAssetFactoryStore';
import { renderAsset } from './assetRenderer';

export function getStoreMode(){return isFirebaseAdminAvailable() ? 'firestore-storage' : 'local-json';}
export function getStoreDiagnostics(){const d=getFirebaseDiagnostics(); return { mode:getStoreMode(), fallbackActive:!d.available, firebase:d };}

export async function addJob(job:any){ return localAddJob(job); }
export async function readJobs(){ return localReadJobs(); }
export async function findJob(jobId:string){ return localFindJob(jobId); }
export async function updateJob(jobId:string,patch:any){ return localUpdateJob(jobId,patch); }
export async function listAssets(){ return localListAssets(); }
export async function findAsset(jobId:string){ return localFindAsset(jobId); }

export async function materializeAsset(jobId:string){ const job=await findJob(jobId); if(!job) return null; const rendered=await renderAsset(job); await localWriteGenerated(rendered.assetFileName, rendered.assetBuffer); await localWriteGenerated(`${jobId}.json`, Buffer.from(JSON.stringify(rendered.manifest,null,2))); const asset={ jobId, tenantId:job.tenantId, fileName:rendered.assetFileName, manifestFile:`${jobId}.json`, manifest:rendered.manifest, createdAt:new Date().toISOString(), published:false }; await localUpsertAsset(asset); await updateJob(jobId,{status:'materialized'}); return asset; }
export async function readGeneratedAsset(fileName:string){ return localReadGenerated(fileName); }
export async function searchAssets(){ return listAssets(); }
export async function publishAsset(jobId:string){ const a=await findAsset(jobId); if(!a) return null; a.published=true; a.publishedAt=new Date().toISOString(); await localUpsertAsset(a); return a; }
export async function rollbackAsset(jobId:string,versionId:string){ return { jobId, versionId, rolledBack:true }; }
export async function approveAsset(jobId:string,approvalPatch:any){ return { jobId, ...approvalPatch, approvalId: randomUUID() }; }
export async function createAssetVersion(jobId:string,versionPatch:any){ return { jobId, versionId: randomUUID(), ...versionPatch }; }
