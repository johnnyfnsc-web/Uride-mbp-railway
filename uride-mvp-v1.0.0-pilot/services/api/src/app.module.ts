import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ProfilesModule } from './profiles/profiles.module';
import { PricingModule } from './pricing/pricing.module';
import { TripsModule } from './trips/trips.module';
import { DriversModule } from './drivers/drivers.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PaymentsModule } from './payments/payments.module';
import { RoutingModule } from './routing/routing.module';
import { SafetyModule } from './safety/safety.module';
import { SupportModule } from './support/support.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RiskModule } from './risk/risk.module';
import { EarningsModule } from './earnings/earnings.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [DatabaseModule, RealtimeModule, AuthModule, ProfilesModule, PricingModule, TripsModule, DriversModule, DispatchModule, PaymentsModule, RoutingModule, SafetyModule, SupportModule, AdminModule, NotificationsModule, RiskModule, EarningsModule, AiModule],
  controllers: [HealthController],
})
export class AppModule {}
