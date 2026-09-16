import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports:[AuthModule],
  controllers:[ProfilesController],
})
export class ProfilesModule {}
