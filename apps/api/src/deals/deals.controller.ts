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
import { DealsService } from './deals.service';
import type { Deal, DealBody, DealListQuery } from './deals.dto';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  list(
    @Query()
    query: DealListQuery,
  ): {
    deals: Deal[];
    total: number;
    total_value: number;
    page: number;
    limit: number;
  } {
    return this.deals.list(query ?? {});
  }

  @Get('board')
  board(): { deals: Deal[] } {
    return this.deals.board();
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: DealBody): { deal: Deal } {
    return { deal: this.deals.create(body ?? {}) };
  }

  @Put(':id')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: DealBody): { deal: Deal } {
    return { deal: this.deals.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.deals.remove(id);
  }
}
