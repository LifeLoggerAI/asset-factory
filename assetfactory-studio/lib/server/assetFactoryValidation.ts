const safe = /^[a-zA-Z0-9._-]+$/;
export function validateJobId(v:unknown){return typeof v==='string'&&v.length>2&&v.length<128&&safe.test(v)}
export function validateTenantId(v:unknown){return typeof v==='string'&&v.length>0&&v.length<128}
export function validateFileName(v:unknown){return typeof v==='string'&&safe.test(v)&&!v.includes('..')}
export function validateGenerateRequest(v:any){if(!v||typeof v!=='object') return 'body required'; if(!validateJobId(v.jobId)) return 'invalid jobId'; if(!validateTenantId(v.tenantId??'default')) return 'invalid tenantId'; if(typeof v.prompt!=='string'||!v.prompt.trim()) return 'invalid prompt'; if(typeof v.type!=='string'||!v.type.trim()) return 'invalid type'; return null;}
