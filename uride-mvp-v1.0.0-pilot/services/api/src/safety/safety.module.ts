import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, RealtimeModule, NotificationsModule],
  controllers: [SafetyController],
  providers: [SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
