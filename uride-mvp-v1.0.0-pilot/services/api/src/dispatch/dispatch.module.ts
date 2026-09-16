import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [NotificationsModule, AuthModule], controllers: [DispatchController], providers: [DispatchService], exports: [DispatchService] })
export class DispatchModule {}