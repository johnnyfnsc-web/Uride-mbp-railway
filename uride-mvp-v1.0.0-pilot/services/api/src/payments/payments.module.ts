import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RiskModule } from '../risk/risk.module';
import { EarningsModule } from '../earnings/earnings.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, DatabaseModule, RealtimeModule, RiskModule, EarningsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}