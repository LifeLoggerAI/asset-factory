// Reject the unadmitted simulation before loading its identity, SDK or listener.
// This does not decide adoption of any future sovereign validator program.
const suppliedRole = process.argv[2];
const role = ['validator', 'validator-9000', 'validator-9001', 'validator-9002'].includes(suppliedRole)
  ? suppliedRole : 'validator';
console.error(`The ${role} simulation is not admitted to the current Factory deployment.`);
console.error('Use the dedicated Firebase/Studio runtime and its existing tenant, provider, signing and release controls.');
console.error('Future validator admission requires documented scope, exact runtime identity and independently controlled signer/registry custody.');
console.error('No simulated root key, provider registration or listener has been created.');
console.error('See docs/security/cloud-storage-integrity-20261007.md and docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md.');
process.exitCode = 1;
