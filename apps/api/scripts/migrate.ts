import { DatabaseService } from '../src/database/database.service';

const database = new DatabaseService();
try {
  database.onModuleInit();
  console.log(JSON.stringify({ event: 'database_migrated' }));
} finally {
  database.close();
}
