import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/auth.decorator';
import { DatabaseService } from './database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  /** Contract §4: `{ ok, db }` — `SELECT 1` DB check, 503 on failure. */
  @Public()
  @Get('health')
  health(): { ok: boolean; db: boolean } {
    try {
      this.database.sqlite.prepare('select 1').get();
      return { ok: true, db: true };
    } catch {
      throw new ServiceUnavailableException('unhealthy');
    }
  }
}
