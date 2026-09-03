import { access } from 'node:fs/promises';

const requiredArtifacts = [
  'dist/src/main.js',
  'dist/src/app.module.js',
  'dist/src/auth/auth.service.js',
  'dist/src/database/database.service.js',
  'dist/src/companies/companies.controller.js',
  'dist/src/contacts/contacts.controller.js',
  'dist/src/deals/deals.controller.js',
  'dist/src/stages/stages.controller.js',
  'dist/src/activities/activities.controller.js',
  'dist/src/custom-fields/custom-fields.controller.js',
  'dist/src/import/import.controller.js',
  'dist/src/stats/stats.controller.js',
  'dist/src/tokens/tokens.controller.js',
];

await Promise.all(requiredArtifacts.map((path) => access(path)));
console.log(`verified ${requiredArtifacts.length} production build artifacts`);
