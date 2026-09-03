import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivitiesController } from './activities/activities.controller';
import { ActivitiesService } from './activities/activities.service';
import { AuthProviderToken } from './auth/auth.constants';
import { createAuth } from './auth/auth';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { CompaniesModule } from './companies/companies.module';
import { ContactsController } from './contacts/contacts.controller';
import { ContactsService } from './contacts/contacts.service';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { DatabaseModule } from './database/database.module';
import { DatabaseService } from './database/database.service';
import { DealsController } from './deals/deals.controller';
import { DealsService } from './deals/deals.service';
import { HealthController } from './health.controller';
import { ImportController } from './import/import.controller';
import { ImportService } from './import/import.service';
import { ProductsModule } from './products/products.module';
import { StagesModule } from './stages/stages.module';
import { StatsController } from './stats/stats.controller';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TokensController } from './tokens/tokens.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    CompaniesModule,
    StagesModule,
    ProductsModule,
    SubscriptionsModule,
    CustomFieldsModule,
  ],
  controllers: [
    HealthController,
    StatsController,
    ContactsController,
    DealsController,
    ActivitiesController,
    ImportController,
    TokensController,
  ],
  providers: [
    AuthService,
    ContactsService,
    DealsService,
    ActivitiesService,
    ImportService,
    {
      provide: AuthProviderToken,
      useFactory: (database: DatabaseService, config: ConfigService) =>
        createAuth(database.db, config),
      inject: [DatabaseService, ConfigService],
    },
    // Global guard-by-default (contract §3): every route requires a session
    // cookie or API token unless marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
