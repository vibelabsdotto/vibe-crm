import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.decorator';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

/**
 * Global guard (registered via APP_GUARD): authenticates every route unless
 * it is marked `@Public()`. Verification order per contract §3:
 * 1. Better-Auth session cookie,
 * 2. `Authorization: Bearer vp_...` API token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = await this.auth.authenticate(request);
    if (!auth) throw new UnauthorizedException('unauthorized');
    request.auth = auth;
    return true;
  }
}
