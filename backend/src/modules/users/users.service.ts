import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { User } from '../../generated/prisma/client';
export function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
  async usernameAvailable(username: string) {
    return {
      username,
      available: !(await this.prisma.user.findUnique({
        where: { usernameKey: username.toLowerCase() },
        select: { id: true },
      })),
      tag: null,
    };
  }
}
