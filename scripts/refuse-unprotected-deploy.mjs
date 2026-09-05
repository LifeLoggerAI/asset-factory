#!/usr/bin/env node

const requested = process.argv[2] || 'manual provider mutation';

console.error(`BLOCKED: ${requested} is not an authorized Asset Factory deployment path.`);
console.error('Production deployment is permitted only through GitHub Actions -> Asset Factory Production Readiness on exact main, with the protected asset-factory-production environment, exact DEPLOY_ASSET_FACTORY confirmation, and keyless Google WIF/ADC identity.');
console.error('Use Verify Deployed Asset Factory for read-only verification of an existing staging or production deployment.');
process.exit(64);
