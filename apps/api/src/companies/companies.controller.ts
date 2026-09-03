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
  CompaniesService,
  type Company,
  type CompanyBody,
} from './companies.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(
    @Query()
    query: Record<string, string>,
  ): { companies: Company[]; total: number; page: number; limit: number } {
    return this.companies.list(query);
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CompanyBody): { company: Company } {
    return { company: this.companies.create(body ?? {}) };
  }

  @Put(':id')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: CompanyBody,
  ): { company: Company } {
    return { company: this.companies.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.companies.remove(id);
  }
}
