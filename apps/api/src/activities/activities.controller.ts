import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ActivitiesService,
  type Activity,
  type ActivityBody,
} from './activities.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @Query('entity_type') entityType: string,
    @Query('entity_id') entityId: string,
  ): { activities: Activity[] } {
    return this.activities.list(entityType, entityId);
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: ActivityBody): { activity: Activity } {
    return { activity: this.activities.create(body ?? {}) };
  }
}
