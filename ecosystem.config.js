
module.exports = {
  apps: [
    {
      name: 'validator-9000',
      script: 'validator/validator.js',
      env: {
        VALIDATOR_PORT: 9000,
        PEER_NODES: 'http://localhost:9001,http://localhost:9002',
      },
    },
    {
      name: 'validator-9001',
      script: 'validator/validator.js',
      env: {
        VALIDATOR_PORT: 9001,
        PEER_NODES: 'http://localhost:9000,http://localhost:9002',
      },
    },
    {
      name: 'validator-9002',
      script: 'validator/validator.js',
      env: {
        VALIDATOR_PORT: 9002,
        PEER_NODES: 'http://localhost:9000,http://localhost:9001',
      },
    },
  ],
};
