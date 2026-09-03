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
  StagesService,
  type CreateStageInput,
  type Stage,
  type UpdateStageInput,
} from './stages.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/stages')
export class StagesController {
  constructor(private readonly stages: StagesService) {}

  @Get()
  list(): { stages: Stage[] } {
    return { stages: this.stages.list() };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreateStageInput): { stage: Stage } {
    return { stage: this.stages.create(body ?? {}) };
  }

  @Put(':key')
  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() body: UpdateStageInput,
  ): { stage: Stage } {
    return { stage: this.stages.update(key, body ?? {}) };
  }

  @Delete(':key')
  remove(
    @Param('key') key: string,
    @Query('reassign_to') reassignTo?: string,
  ): { ok: boolean; reassigned: number } {
    return this.stages.remove(key, reassignTo);
  }
}
