import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Auth } from '../auth/auth.decorator';
import { AuthService, type TokenMeta } from '../auth/auth.service';
import type { AuthContext } from '../auth/auth.types';

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/tokens')
export class TokensController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() dto: CreateTokenDto,
  ): { id: string; token: string; prefix: string } {
    // Plaintext token is returned exactly once — only the hash is stored.
    return this.auth.createToken(auth.email, dto.name);
  }

  @Get()
  list(): { tokens: TokenMeta[] } {
    // Single-workspace: all tokens, camelCase, never hashes (contract §4).
    return { tokens: this.auth.listTokens() };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    if (!this.auth.revokeToken(id)) {
      throw new NotFoundException('not_found');
    }
    return { ok: true };
  }
}
