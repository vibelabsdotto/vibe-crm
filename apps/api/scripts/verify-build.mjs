import { access } from 'node:fs/promises';

const requiredArtifacts = [
  'dist/src/main.js',
  'dist/src/app.module.js',
  'dist/src/plans/plans.controller.js',
  'dist/src/plans/public-plans.controller.js',
  'dist/src/tokens/tokens.controller.js',
  'dist/src/auth/auth.service.js',
  'dist/src/database/database.service.js',
  'dist/src/storage/storage.service.js',
  'dist/scripts/remap-owners.js',
];

await Promise.all(requiredArtifacts.map((path) => access(path)));
console.log(`verified ${requiredArtifacts.length} production build artifacts`);
