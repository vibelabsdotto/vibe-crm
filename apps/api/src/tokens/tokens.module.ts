import { Module } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { TokensController } from './tokens.controller';

@Module({
  controllers: [TokensController],
  providers: [AuthService],
})
export class TokensModule {}
