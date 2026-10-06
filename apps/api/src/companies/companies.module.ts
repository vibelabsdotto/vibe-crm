import { Module } from '@nestjs/common';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { WorkspaceCompanyController } from './workspace-company.controller';

@Module({
  imports: [CustomFieldsModule],
  controllers: [CompaniesController, WorkspaceCompanyController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
