import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingsController } from './ratings.controller';
import { RatingsReadService } from './ratings-read.service';
import { RatingsRepository } from './ratings.repository';
import { RatingsService } from './ratings.service';
@Module({
  imports: [AuthModule],
  controllers: [RatingsController],
  providers: [RatingsService, RatingsRepository, RatingsReadService],
  exports: [RatingsService, RatingsRepository],
})
export class RatingsModule {}
