import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }
  @Get('health/ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
  @Get('health')
  ping() {
    return { status: 'ok', region: 'local' };
  }
}
