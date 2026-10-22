import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { User, AuthSession } from '../../generated/prisma/client';
import type { Environment } from '../../config/environment';
import { ApiException } from '../../common/errors/api-exception';
import { UsersService, publicUser } from '../users/users.service';
import { PasswordService } from './password.service';
import type { LoginInput, RegisterInput } from './auth.schemas';
export const digestToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const unauthorized = () =>
  new ApiException(
    401,
    'unauthenticated',
    'Your session has expired. Sign in again.',
  );
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async register(input: RegisterInput) {
    const passwordHash = await this.passwords.hash(input.password);
    const rawToken = randomBytes(32).toString('base64url');
    try {
      const { user, session } = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            username: input.username,
            usernameKey: input.username.toLowerCase(),
            passwordHash,
          },
        });
        const session = await this.createSession(tx, user.id, false, rawToken);
        return { user, session };
      });
      return this.issue(user, session, rawToken);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const matches = await this.prisma.user.findMany({
          where: {
            OR: [
              { email: input.email },
              { usernameKey: input.username.toLowerCase() },
            ],
          },
          select: { email: true, usernameKey: true },
        });
        const fieldErrors: Record<string, string[]> = {};
        if (matches.some((user) => user.email === input.email))
          fieldErrors.email = ['That email is already registered.'];
        if (
          matches.some(
            (user) => user.usernameKey === input.username.toLowerCase(),
          )
        )
          fieldErrors.username = ['That username is already registered.'];
        throw new ApiException(
          409,
          'identity_taken',
          'Some details are already in use.',
          fieldErrors,
        );
      }
      throw error;
    }
  }

  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email);
    const valid = await this.passwords.verify(
      input.password,
      user?.passwordHash,
    );
    if (!user || !valid)
      throw new ApiException(
        401,
        'invalid_credentials',
        'Email or password is incorrect.',
      );
    const rawToken = randomBytes(32).toString('base64url');
    const session = await this.createSession(
      this.prisma,
      user.id,
      input.remember,
      rawToken,
    );
    return this.issue(user, session, rawToken);
  }

  private createSession(
    tx: Prisma.TransactionClient,
    userId: string,
    persistent: boolean,
    rawToken: string,
  ) {
    const duration = persistent
      ? this.config.get('REMEMBER_SESSION_DAYS', { infer: true }) * 86400000
      : this.config.get('SESSION_TTL_HOURS', { infer: true }) * 3600000;
    return tx.authSession.create({
      data: {
        userId,
        persistent,
        expiresAt: new Date(Date.now() + duration),
        tokens: { create: { tokenHash: digestToken(rawToken) } },
      },
    });
  }

  async refresh(rawToken: unknown) {
    if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(rawToken))
      throw unauthorized();
    const found = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: digestToken(rawToken) },
      select: { id: true, sessionId: true },
    });
    if (!found) throw unauthorized();
    const nextToken = randomBytes(32).toString('base64url');
    const result = await this.prisma.$transaction(async (tx) => {
      // Serializes rotation/revocation for the family, including concurrent requests.
      await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id = ${found.sessionId}::uuid FOR UPDATE`;
      const session = await tx.authSession.findUniqueOrThrow({
        where: { id: found.sessionId },
        include: { user: true },
      });
      const token = await tx.refreshToken.findUniqueOrThrow({
        where: { id: found.id },
      });
      if (session.revokedAt || session.expiresAt <= new Date()) return null;
      if (token.usedAt) {
        // Commit family revocation before returning the authentication error.
        await tx.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      await tx.refreshToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: { sessionId: session.id, tokenHash: digestToken(nextToken) },
      });
      await tx.authSession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
      return session;
    });
    if (!result) throw unauthorized();
    return this.issue(result.user, result, nextToken);
  }

  async logout(rawToken: unknown) {
    if (typeof rawToken !== 'string') return;
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: digestToken(rawToken) },
      select: { sessionId: true },
    });
    if (token)
      await this.prisma.authSession.updateMany({
        where: { id: token.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
  }

  private async issue(user: User, session: AuthSession, refreshToken: string) {
    const expiresIn = this.config.get('ACCESS_TOKEN_TTL_SECONDS', {
      infer: true,
    });
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id, jti: randomUUID() },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        algorithm: 'HS256',
        issuer: 'vortix-api',
        audience: 'vortix-frontend',
        expiresIn,
      },
    );
    return {
      body: { user: publicUser(user), accessToken, expiresIn },
      refreshToken,
      session,
    };
  }

  async authenticate(accessToken: string) {
    let claims: { sub: string; sid: string };
    try {
      claims = await this.jwt.verifyAsync(accessToken, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        algorithms: ['HS256'],
        issuer: 'vortix-api',
        audience: 'vortix-frontend',
      });
    } catch {
      throw unauthorized();
    }
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string')
      throw unauthorized();
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    if (!session) throw unauthorized();
    return publicUser(session.user);
  }
}
