import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './auth.decorator';
import { AuthService } from './auth.service';
import type { LocalAccountUser } from './local-account';

@Controller('v1/local-account')
export class LocalAccountController {
  constructor(private readonly auth: AuthService) {}

  // This route has its own stricter loopback gate, even with a valid real session.
  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  get(@Req() request: Request): { user: LocalAccountUser } {
    const user = this.auth.getLocalAccount(request);
    if (!user) throw new NotFoundException('not_found');
    return { user };
  }
}
