import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
const requiredArtifacts = [
  'dist/src/main.js',
  'dist/src/app.module.js',
  'dist/src/auth/auth.service.js',
  'dist/src/database/database.service.js',
  'dist/src/companies/companies.controller.js',
  'dist/src/companies/workspace-company.controller.js',
  'dist/src/contacts/contacts.controller.js',
  'dist/src/deals/deals.controller.js',
  'dist/src/deals/deal-view.controller.js',
  'dist/src/deals/deal-view.service.js',
  'dist/src/stages/stages.controller.js',
  'dist/src/activities/activities.controller.js',
  'dist/src/custom-fields/custom-fields.controller.js',
  'dist/src/import/import.controller.js',
  'dist/src/stats/stats.controller.js',
  'dist/src/tokens/tokens.controller.js',
];

await Promise.all(
  requiredArtifacts.map((path) => access(join(apiDirectory, path))),
);

const migrationDirectory = join(apiDirectory, 'drizzle');
const migrations = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();
assert.ok(migrations.length > 0, 'No source SQL migrations found');

await Promise.all(
  migrations.map(async (name) => {
    const [source, compiled] = await Promise.all([
      readFile(join(migrationDirectory, name)),
      readFile(join(apiDirectory, 'dist/src/drizzle', name)),
    ]);
    assert.ok(
      source.equals(compiled),
      `Compiled SQL migration differs: ${name}`,
    );
  }),
);

console.log(
  `verified ${requiredArtifacts.length} production build artifacts and ${migrations.length} SQL migrations`,
);
