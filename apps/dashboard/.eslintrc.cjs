module.exports = {
  extends: ['next/core-web-vitals'],
  plugins: ['import'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: 'pg', message: 'Dashboard UI must not access the DB directly.' },
        { name: '@pillar/db', message: 'Server loaders only.' },
        { name: 'ioredis', message: 'Use the /v1 proxy.' }
      ],
      patterns: ['services/*', '@pillar/idempotency*']
    }]
  },
  overrides: [
    { files: ['src/server/**'], rules: { 'no-restricted-imports': ['error', { patterns: ['services/*', '@pillar/idempotency*'] }] } }
  ]
};
