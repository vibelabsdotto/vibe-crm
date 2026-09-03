import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ImportService,
  type ImportCompaniesBody,
  type ImportContactsBody,
} from './import.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
// Bodies are plain interfaces so ValidationPipe passes them through untouched
// (contract §4: flat `{ error }` via the global JsonExceptionFilter).
// Body-Limit 3 MB: enforced globally in main.ts (entity.too.large → 413
// `{ error: 'payload_too_large' }`).
@Controller('v1')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('contacts/import')
  @HttpCode(200)
  importContacts(@Body() body: ImportContactsBody): {
    imported: number;
    companiesCreated: number;
    skipped: number;
  } {
    return this.imports.importContacts(body ?? {});
  }

  @Post('companies/import')
  @HttpCode(200)
  importCompanies(@Body() body: ImportCompaniesBody): {
    imported: number;
    skipped: number;
    duplicates: number;
  } {
    return this.imports.importCompanies(body ?? {});
  }
}
