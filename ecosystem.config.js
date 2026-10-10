
module.exports = {
  apps: [
    {
      name: 'validator-9000',
      // Historical script: 'validator/validator.js'.
      // VALIDATOR_PORT below was not read by that prototype (it uses PORT).
      script: 'scripts/reject-unadmitted-validator-deployment.mjs',
      args: 'validator-9000',
      autorestart: false,
      env: {
        VALIDATOR_PORT: 9000,
        PEER_NODES: 'http://localhost:9001,http://localhost:9002',
      },
    },
    {
      name: 'validator-9001',
      // Historical script: 'validator/validator.js'.
      // VALIDATOR_PORT below was not read by that prototype (it uses PORT).
      script: 'scripts/reject-unadmitted-validator-deployment.mjs',
      args: 'validator-9001',
      autorestart: false,
      env: {
        VALIDATOR_PORT: 9001,
        PEER_NODES: 'http://localhost:9000,http://localhost:9002',
      },
    },
    {
      name: 'validator-9002',
      // Historical script: 'validator/validator.js'.
      // VALIDATOR_PORT below was not read by that prototype (it uses PORT).
      script: 'scripts/reject-unadmitted-validator-deployment.mjs',
      args: 'validator-9002',
      autorestart: false,
      env: {
        VALIDATOR_PORT: 9002,
        PEER_NODES: 'http://localhost:9000,http://localhost:9001',
      },
    },
  ],
};
