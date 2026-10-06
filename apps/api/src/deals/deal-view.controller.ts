import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type { DealView } from './deal-view.dto';
import { DealViewService } from './deal-view.service';

// Register before DealsController so /view is never resolved as a Deal ID.
// Authentication and shared-workspace access follow the global guards.
@Controller('v1/deals/view')
export class DealViewController {
  constructor(private readonly views: DealViewService) {}

  @Get()
  get(): DealView {
    return this.views.get();
  }

  @Put()
  update(@Body() body: unknown): DealView {
    return this.views.setColumns(body);
  }

  @Post('reset')
  @HttpCode(200)
  reset(): DealView {
    return this.views.resetColumns();
  }

  @Put('visibility/:key')
  setVisibility(@Param('key') key: string, @Body() body: unknown): DealView {
    return this.views.setVisibility(key, body);
  }

  @Delete('visibility/:key')
  removeVisibility(@Param('key') key: string): DealView {
    return this.views.removeVisibility(key);
  }
}
