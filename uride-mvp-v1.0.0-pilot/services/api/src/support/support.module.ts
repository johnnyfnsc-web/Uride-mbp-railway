import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [DatabaseModule, RealtimeModule, NotificationsModule, RiskModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}