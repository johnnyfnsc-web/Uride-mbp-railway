import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { PricingModule } from '../pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RiskModule } from '../risk/risk.module';
import { AuthModule } from '../auth/auth.module';

@Module({imports:[AuthModule, PricingModule, NotificationsModule, RiskModule],controllers:[TripsController],providers:[TripsService]})
export class TripsModule {}