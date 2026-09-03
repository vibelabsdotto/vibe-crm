import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Stats {
  contacts: number;
  companies: number;
  deals: number;
  dealValue: number;
}

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/stats')
export class StatsController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  get(): Stats {
    const { sqlite } = this.database;
    const contacts = (
      sqlite.prepare('SELECT COUNT(*) as n FROM contacts').get() as {
        n: number;
      }
    ).n;
    const companies = (
      sqlite.prepare('SELECT COUNT(*) as n FROM companies').get() as {
        n: number;
      }
    ).n;
    const deals = (
      sqlite.prepare('SELECT COUNT(*) as n FROM deals').get() as {
        n: number;
      }
    ).n;
    // Contract §4: dealValue = SUM(value) excluding deals whose stage has
    // is_lost = 1. Deals on unknown stages count as not lost.
    const dealValue = (
      sqlite
        .prepare(
          `SELECT COALESCE(SUM(d.value), 0) as total FROM deals d
           LEFT JOIN stages s ON s.key = d.stage
           WHERE COALESCE(s.is_lost, 0) != 1`,
        )
        .get() as { total: number }
    ).total;
    return { contacts, companies, deals, dealValue };
  }
}
