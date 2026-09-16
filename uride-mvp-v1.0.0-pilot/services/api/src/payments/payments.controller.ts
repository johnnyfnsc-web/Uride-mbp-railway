import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { UserGuard } from '../auth/user.guard';

@Controller('v1/payments')
export class PaymentsController {
  constructor(private readonly payments:PaymentsService){}

  @UseGuards(UserGuard)
  @Post('trip/:tripId/intent')
  intent(@Param('tripId') tripId:string,@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){
    if(req.userRole!=='PASSENGER') throw new ForbiddenException('Passenger role required');
    return this.payments.createTripPaymentIntent(tripId,key,body,req.userId);
  }

  @UseGuards(UserGuard)
  @Post(':paymentId/sync')
  sync(@Param('paymentId') paymentId:string,@Req() req:any){ return this.payments.syncPayment(paymentId,req.userId,req.userRole); }

  @UseGuards(UserGuard)
  @Post(':paymentId/refund')
  refund(@Param('paymentId') paymentId:string,@Body() body:any,@Req() req:any){
    if(req.userRole!=='ADMIN') throw new ForbiddenException('Admin role required');
    return this.payments.refundPayment(paymentId,body);
  }

  @Post('stripe/webhook')
  webhook(@Req() req:any,@Headers('stripe-signature') signature:string){
    return this.payments.handleStripeWebhook(req.rawBody,signature);
  }

  @UseGuards(UserGuard)
  @Post('connect/drivers/:driverUserId/account')
  connectAccount(@Param('driverUserId') id:string,@Req() req:any){
    if(req.userRole!=='DRIVER'||req.userId!==id) throw new ForbiddenException('Driver access denied');
    return this.payments.createConnectAccount(id);
  }

  @UseGuards(UserGuard)
  @Post('connect/drivers/:driverUserId/onboarding-link')
  onboardingLink(@Param('driverUserId') id:string,@Req() req:any){
    if(req.userRole!=='DRIVER'||req.userId!==id) throw new ForbiddenException('Driver access denied');
    return this.payments.connectOnboardingLink(id);
  }

  @UseGuards(UserGuard)
  @Get('connect/drivers/:driverUserId/status')
  connectStatus(@Param('driverUserId') id:string,@Req() req:any){
    if(req.userRole!=='DRIVER'||req.userId!==id) throw new ForbiddenException('Driver access denied');
    return this.payments.refreshConnectStatus(id);
  }

  @UseGuards(UserGuard)
  @Get('trip/:tripId')
  byTrip(@Param('tripId') tripId:string,@Req() req:any){ return this.payments.getTripPayments(tripId,req.userId,req.userRole); }

  @UseGuards(UserGuard)
  @Get(':paymentId/receipt')
  receipt(@Param('paymentId') paymentId:string,@Req() req:any){ return this.payments.getReceipt(paymentId,req.userId,req.userRole); }
}
