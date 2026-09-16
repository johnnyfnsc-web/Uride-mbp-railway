import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { EarningsModule } from '../earnings/earnings.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, NotificationsModule, PaymentsModule, EarningsModule, AiModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}