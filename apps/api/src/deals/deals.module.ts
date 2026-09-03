import { Module } from '@nestjs/common';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { StagesModule } from '../stages/stages.module';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';

@Module({
  imports: [CustomFieldsModule, StagesModule],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
