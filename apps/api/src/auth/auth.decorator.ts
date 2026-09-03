import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AuthContext, AuthenticatedRequest } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as public — the global APP_GUARD skips authentication. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const Auth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>()
      .auth as AuthContext;
  },
);
