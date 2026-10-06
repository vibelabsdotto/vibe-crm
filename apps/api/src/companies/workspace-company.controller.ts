import { Body, Controller, Get, Put } from '@nestjs/common';
import { CompaniesService, type Company } from './companies.service';

@Controller('v1/workspace/company')
export class WorkspaceCompanyController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  get(): { company_id: string | null; company: Company | null } {
    return this.companies.workspaceCompany();
  }

  @Put()
  update(@Body() body: unknown): {
    company_id: string | null;
    company: Company | null;
  } {
    return this.companies.setWorkspaceCompany(body);
  }
}
