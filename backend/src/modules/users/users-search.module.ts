import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersSearchController, UsersSearchService } from './users-search';

/** Separate from UsersModule: auth consumes identity, discovery consumes auth. */
@Module({
  imports: [AuthModule],
  controllers: [UsersSearchController],
  providers: [UsersSearchService],
})
export class UsersSearchModule {}
