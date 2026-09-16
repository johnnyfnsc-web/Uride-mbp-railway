import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';

@Module({
  imports:[DatabaseModule,NotificationsModule],
  controllers:[RiskController],
  providers:[RiskService],
  exports:[RiskService],
})
export class RiskModule {}
