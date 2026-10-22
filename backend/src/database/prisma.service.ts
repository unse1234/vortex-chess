import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { Environment } from '../config/environment';
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Environment, true>) {
    // Prisma's PostgreSQL adapter expects UTC DateTime conversion. Set this on
    // every connection, including databases whose server timezone is non-UTC.
    const url = new URL(config.get('DATABASE_URL', { infer: true }));
    url.searchParams.set(
      'options',
      `${url.searchParams.get('options') ?? ''} -c timezone=UTC`.trim(),
    );
    super({
      adapter: new PrismaPg({
        connectionString: url.toString(),
        max: 10,
      }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
