import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { databaseSchema } from './schema';

export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof databaseSchema>;
  isReady = false;

  constructor(
    readonly databasePath = process.env.DATABASE_PATH ??
      './data/vibe-crm.sqlite',
  ) {
    if (databasePath !== ':memory:') {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.sqlite = new Database(databasePath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('busy_timeout = 5000');
    this.sqlite.pragma('foreign_keys = ON');
    this.db = drizzle(this.sqlite, { schema: databaseSchema });
  }

  onModuleInit(): void {
    this.runMigrations();
    this.isReady = true;
  }

  onModuleDestroy(): void {
    this.close();
  }

  testRead(): void {
    this.sqlite.prepare('select 1 as healthy').get();
  }

  close(): void {
    if (this.sqlite.open) this.sqlite.close();
  }

  private runMigrations(): void {
    // Resolve the drizzle/ dir from the source tree: dist layout is
    // dist/src/database/database.service.js (→ ../../.. = apps/api), while
    // tsx/jest run directly from apps/api/src (→ ../.. = apps/api). Both
    // layouts must land in apps/api/drizzle.
    const candidates = [
      join(__dirname, '..', '..', 'drizzle'),
      join(__dirname, '..', '..', '..', 'drizzle'),
    ];
    const migrationDirectory =
      candidates.find((dir) => existsSync(dir)) ?? candidates[0];
    const migrations = readdirSync(migrationDirectory)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();

    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS __vibecrm_migrations (
          name TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL
        )
      `);
      const applied = this.sqlite.prepare(
        'select 1 from __vibecrm_migrations where name = ?',
      );
      const record = this.sqlite.prepare(
        'insert into __vibecrm_migrations (name, applied_at) values (?, ?)',
      );
      for (const migration of migrations) {
        if (applied.get(migration)) continue;
        this.sqlite.exec(
          readFileSync(join(migrationDirectory, migration), 'utf8'),
        );
        record.run(migration, Date.now());
      }
      this.sqlite.exec('COMMIT');
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}
