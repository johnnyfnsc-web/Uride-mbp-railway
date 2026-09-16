import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications:NotificationsService){}

  @Post('devices/register') register(@Body() b:any){ return this.notifications.registerDevice(b); }
  @Post('devices/unregister') unregister(@Body() b:any){ return this.notifications.unregisterDevice(b); }
  @Get('users/:userId/devices') devices(@Param('userId') userId:string){ return this.notifications.devices(userId); }
  @Get('users/:userId/history') history(@Param('userId') userId:string){ return this.notifications.history(userId); }
  @Post('process-scheduled-reminders') processScheduledReminders(){ return this.notifications.processScheduledRideReminders(); }
  @Post('process-document-expiry') processDocumentExpiry(){ return this.notifications.processDocumentExpiryNotifications(); }
}
