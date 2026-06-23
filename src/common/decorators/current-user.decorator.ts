import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export type SessionUser = {
  sub: string;
  email: string;
  role: string;
  name: string | null;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: SessionUser }>();
    return request.user;
  },
);
