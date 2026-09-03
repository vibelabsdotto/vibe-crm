import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  SubscriptionsService,
  type Subscription,
  type SubscriptionBody,
  type SubscriptionListQuery,
  type SubscriptionSummary,
} from './subscriptions.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  list(
    @Query()
    query: SubscriptionListQuery,
  ): {
    subscriptions: Subscription[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.subscriptions.list(query ?? {});
  }

  // Static route BEFORE any :id route so /summary never matches an id.
  @Get('summary')
  summary(): SubscriptionSummary {
    return this.subscriptions.summary();
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: SubscriptionBody): { subscription: Subscription } {
    return { subscription: this.subscriptions.create(body ?? {}) };
  }

  @Put(':id')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: SubscriptionBody,
  ): { subscription: Subscription } {
    return { subscription: this.subscriptions.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.subscriptions.remove(id);
  }
}
