import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RiskService } from '../risk/risk.service';
import { EarningsService } from '../earnings/earnings.service';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private realtime: RealtimeService, private risk: RiskService, private earnings: EarningsService) {}

  private stripeSecret() {
    const key=process.env.STRIPE_SECRET_KEY;
    if(!key) throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    return key;
  }

  private async stripe(path:string, params?:Record<string,any>, idempotencyKey?:string, method='POST') {
    const headers:any={
      Authorization:`Bearer ${this.stripeSecret()}`,
      'Content-Type':'application/x-www-form-urlencoded',
    };
    if(idempotencyKey) headers['Idempotency-Key']=idempotencyKey;
    const body=new URLSearchParams();
    Object.entries(params||{}).forEach(([k,v])=>{
      if(v!==undefined&&v!==null) body.append(k,String(v));
    });
    const response=await fetch(`https://api.stripe.com/v1/${path}`,{
      method,
      headers,
      ...(method==='GET'?{}:{body:body.toString()}),
    });
    const result:any=await response.json().catch(()=>({}));
    if(!response.ok) throw new BadRequestException(result?.error?.message||`Stripe request failed (${response.status})`);
    return result;
  }

  private money(value:number){ return Math.round(value*100)/100; }
  private cents(value:number){ return Math.round(this.money(value)*100); }

  private mapIntentStatus(status:string) {
    if(status==='succeeded') return 'SUCCEEDED';
    if(['requires_action','requires_confirmation','requires_payment_method'].includes(status)) return 'ACTION_REQUIRED';
    if(status==='processing') return 'PROCESSING';
    if(status==='canceled') return 'FAILED';
    return 'PENDING';
  }

  private async ensureReceipt(paymentId:string) {
    const payment=await this.prisma.payment.findUnique({where:{id:paymentId},include:{receipt:true}});
    if(!payment || payment.receipt || payment.status!=='SUCCEEDED') return payment?.receipt||null;
    return this.prisma.receipt.create({
      data:{
        paymentId,
        receiptNumber:`UR-${Date.now()}-${payment.id.slice(0,6).toUpperCase()}`,
        subtotal:Number(payment.subtotal||payment.amount),
        tip:Number(payment.tip||0),
        adjustments:0,
        total:Number(payment.amount),
        currency:payment.currency,
      },
    });
  }

  async createTripPaymentIntent(tripId:string,idempotencyKey:string,body:any={},actorUserId?:string){
    if(!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    const existing=await this.prisma.payment.findUnique({where:{idempotencyKey},include:{receipt:true}});
    if(existing){
      if(existing.tripId!==tripId) throw new ConflictException('Idempotency key already belongs to another trip');
      if(existing.providerPaymentId){
        const intent=await this.stripe(`payment_intents/${existing.providerPaymentId}`,undefined,undefined,'GET');
        return {idempotentReplay:true,payment:existing,clientSecret:intent.client_secret,paymentIntentId:intent.id};
      }
    }

    const trip=await this.prisma.trip.findUnique({
      where:{id:tripId},
      include:{driver:{include:{user:{select:{id:true}}}}},
    });
    if(!trip) throw new NotFoundException('Trip not found');
    if(actorUserId && trip.passengerUserId!==actorUserId) throw new ForbiddenException('Passenger payment access denied');
    await this.risk.assertPaymentAllowed(trip.passengerUserId);
    const cancellationCharge=['CANCELLED','NO_SHOW'].includes(trip.status)&&Number(trip.cancellationFee||0)>0&&trip.cancellationFeeStatus==='PENDING';
    if(trip.status!=='COMPLETED'&&!cancellationCharge) throw new ConflictException('Trip must be COMPLETED or have a pending cancellation/no-show fee before payment');

    const subtotal=cancellationCharge?Number(trip.cancellationFee):Number(trip.finalFare??trip.estimatedFare);
    const tip=cancellationCharge?0:Math.max(0,Number(body.tip??0));
    if(!Number.isFinite(subtotal)||subtotal<0||!Number.isFinite(tip)||tip<0) throw new BadRequestException('Trip fare or tip is invalid');
    const total=this.money(subtotal+tip);
    const pricingRule=await this.prisma.pricingRule.findFirst({where:{serviceType:trip.serviceType,isActive:true},orderBy:{updatedAt:'desc'}});
    const commissionRate=Math.max(0,Math.min(0.6,Number(pricingRule?.platformCommissionRate??process.env.URIDE_COMMISSION_RATE??0.20)));
    const platformFee=this.money(subtotal*commissionRate);
    const driverAmount=this.money(total-platformFee);
    const requireConnect=String(process.env.STRIPE_REQUIRE_CONNECT||'false').toLowerCase()==='true';
    const driver=trip.driver;
    if(requireConnect && (!driver?.stripeAccountId||!driver.stripePayoutsEnabled)) {
      throw new ConflictException('Driver Stripe Connect payout account is not ready');
    }

    const params:any={
      amount:this.cents(total),
      currency:'usd',
      'automatic_payment_methods[enabled]':'true',
      description:cancellationCharge?`URide cancellation/no-show fee ${tripId}`:`URide trip ${tripId}`,
      'metadata[tripId]':tripId,
      'metadata[passengerUserId]':trip.passengerUserId,
      'metadata[driverProfileId]':trip.driverProfileId||'',
      'metadata[subtotal]':subtotal.toFixed(2),
      'metadata[tip]':tip.toFixed(2),
      'metadata[platformFee]':platformFee.toFixed(2),
      'metadata[paymentKind]':cancellationCharge?'CANCELLATION_FEE':'TRIP_FARE',
    };
    if(driver?.stripeAccountId && driver.stripePayoutsEnabled){
      params['application_fee_amount']=this.cents(platformFee);
      params['transfer_data[destination]']=driver.stripeAccountId;
    }

    const intent=await this.stripe('payment_intents',params,idempotencyKey);
    const status=this.mapIntentStatus(intent.status) as any;

    const payment=await this.prisma.payment.upsert({
      where:{idempotencyKey},
      update:{
        provider:'STRIPE',providerPaymentId:intent.id,amount:total,subtotal,tip,platformFee,driverAmount,currency:'USD',status,
      },
      create:{
        tripId,provider:'STRIPE',providerPaymentId:intent.id,idempotencyKey,amount:total,subtotal,tip,platformFee,driverAmount,currency:'USD',status,
      },
      include:{receipt:true},
    });
    await this.prisma.tripEvent.create({
      data:{tripId,type:'PAYMENT_INTENT_CREATED',metadata:{paymentId:payment.id,paymentIntentId:intent.id,subtotal,tip,total,platformFee,driverAmount,paymentKind:cancellationCharge?'CANCELLATION_FEE':'TRIP_FARE'}},
    });
    return {idempotentReplay:false,payment,clientSecret:intent.client_secret,paymentIntentId:intent.id,publishableKey:process.env.STRIPE_PUBLISHABLE_KEY||null};
  }

  async syncPayment(paymentId:string,actorUserId?:string,actorRole?:string){
    const payment=await this.prisma.payment.findUnique({where:{id:paymentId},include:{trip:{include:{driver:true}}}});
    if(!payment) throw new NotFoundException('Payment not found');
    if(actorUserId && actorRole!=='ADMIN' && payment.trip.passengerUserId!==actorUserId && payment.trip.driver?.userId!==actorUserId) throw new ForbiddenException('Payment access denied');
    if(payment.provider!=='STRIPE'||!payment.providerPaymentId) return payment;
    const intent=await this.stripe(`payment_intents/${payment.providerPaymentId}`,undefined,undefined,'GET');
    const status=this.mapIntentStatus(intent.status) as any;
    const updated=await this.prisma.payment.update({
      where:{id:payment.id},
      data:{
        status,
        processedAt:status==='SUCCEEDED'||status==='FAILED'?new Date():undefined,
        failureCode:intent.last_payment_error?.code||null,
        failureMessage:intent.last_payment_error?.message||null,
      },
      include:{receipt:true},
    });
    if(status==='FAILED'){
      const trip=await this.prisma.trip.findUnique({where:{id:payment.tripId},select:{passengerUserId:true}});
      if(trip) await this.risk.evaluatePaymentFailure(trip.passengerUserId,payment.id,payment.tripId);
    }
    if(status==='SUCCEEDED'){
      await this.ensureReceipt(payment.id);
      await this.earnings.recordSuccessfulPayment(payment.id);
      const feeTrip=await this.prisma.trip.findUnique({where:{id:payment.tripId},select:{cancellationFeeStatus:true,cancellationFee:true}});
      if(feeTrip?.cancellationFeeStatus==='PENDING'&&Number(feeTrip.cancellationFee||0)>0){
        await this.prisma.trip.update({where:{id:payment.tripId},data:{cancellationFeeStatus:'CHARGED'}});
      }
    }
    return this.prisma.payment.findUnique({where:{id:payment.id},include:{receipt:true}});
  }

  private verifyStripeSignature(raw:Buffer, signature:string){
    const secret=process.env.STRIPE_WEBHOOK_SECRET;
    if(!secret) throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
    const parts=String(signature||'').split(',');
    const timestamp=parts.find(x=>x.startsWith('t='))?.slice(2);
    const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
    if(!timestamp||!signatures.length) throw new BadRequestException('Invalid Stripe signature');
    if(Math.abs(Date.now()/1000-Number(timestamp))>300) throw new BadRequestException('Stale Stripe webhook');
    const expected=createHmac('sha256',secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    const valid=signatures.some(sig=>{
      const a=Buffer.from(sig),b=Buffer.from(expected);
      return a.length===b.length&&timingSafeEqual(a,b);
    });
    if(!valid) throw new BadRequestException('Invalid Stripe signature');
  }

  async handleStripeWebhook(raw:Buffer,signature:string){
    if(!raw) throw new BadRequestException('Raw Stripe webhook body is required');
    this.verifyStripeSignature(raw,signature);
    const event:any=JSON.parse(raw.toString('utf8'));
    const already=await this.prisma.stripeWebhookEvent.findUnique({where:{id:event.id}});
    if(already) return {received:true,idempotentReplay:true};
    await this.prisma.stripeWebhookEvent.create({data:{id:event.id,type:event.type,payload:event}});
    try {
    const intent=event.data?.object;
    if(event.type==='charge.dispute.created'){
      const dispute=event.data?.object;
      const paymentIntentId=typeof dispute?.payment_intent==='string'?dispute.payment_intent:null;
      if(paymentIntentId){
        const disputedPayment=await this.prisma.payment.findUnique({where:{providerPaymentId:paymentIntentId}});
        if(disputedPayment){
          const disputedTrip=await this.prisma.trip.findUnique({where:{id:disputedPayment.tripId},select:{passengerUserId:true}});
          if(disputedTrip){
            const prior=await this.prisma.riskSignal.findFirst({where:{userId:disputedTrip.passengerUserId,paymentId:disputedPayment.id,type:'CHARGEBACK'}});
            if(!prior) await this.risk.addSignal(disputedTrip.passengerUserId,'CHARGEBACK',{paymentId:disputedPayment.id,tripId:disputedPayment.tripId,metadata:{disputeId:dispute.id,reason:dispute.reason||null}});
          }
          await this.prisma.tripEvent.create({data:{tripId:disputedPayment.tripId,type:'PAYMENT_DISPUTE_CREATED',metadata:{paymentId:disputedPayment.id,disputeId:dispute.id,reason:dispute.reason||null}}});
        }
      }
    }
    if(intent?.object==='payment_intent'){
      const payment=await this.prisma.payment.findUnique({where:{providerPaymentId:intent.id}});
      if(payment){
        const status=this.mapIntentStatus(intent.status) as any;
        await this.prisma.payment.update({
          where:{id:payment.id},
          data:{
            status,
            processedAt:status==='SUCCEEDED'||status==='FAILED'?new Date():undefined,
            failureCode:intent.last_payment_error?.code||null,
            failureMessage:intent.last_payment_error?.message||null,
          },
        });
        if(status==='FAILED'){
          const riskTrip=await this.prisma.trip.findUnique({where:{id:payment.tripId},select:{passengerUserId:true}});
          if(riskTrip) await this.risk.evaluatePaymentFailure(riskTrip.passengerUserId,payment.id,payment.tripId);
        }
        if(status==='SUCCEEDED'){
          await this.ensureReceipt(payment.id);
          await this.earnings.recordSuccessfulPayment(payment.id);
          const feeTrip=await this.prisma.trip.findUnique({where:{id:payment.tripId},select:{cancellationFeeStatus:true,cancellationFee:true}});
          if(feeTrip?.cancellationFeeStatus==='PENDING'&&Number(feeTrip.cancellationFee||0)>0){
            await this.prisma.trip.update({where:{id:payment.tripId},data:{cancellationFeeStatus:'CHARGED'}});
          }
        }
        const type=status==='SUCCEEDED'?'PAYMENT_SUCCEEDED':status==='FAILED'?'PAYMENT_FAILED':'PAYMENT_UPDATED';
        await this.prisma.tripEvent.create({data:{tripId:payment.tripId,type,metadata:{paymentId:payment.id,paymentIntentId:intent.id,status}}});
        this.realtime.publish(payment.tripId,type,{paymentId:payment.id,status,amount:Number(payment.amount)});
      }
    }
    return {received:true,idempotentReplay:false};
    } catch (error) {
      await this.prisma.stripeWebhookEvent.deleteMany({where:{id:event.id}});
      throw error;
    }
  }

  async createConnectAccount(driverUserId:string){
    const driver=await this.prisma.driverProfile.findUnique({where:{userId:driverUserId},include:{user:true}});
    if(!driver) throw new NotFoundException('Driver profile not found');
    if(driver.stripeAccountId) return {accountId:driver.stripeAccountId,existing:true};
    const account=await this.stripe('accounts',{
      country:'US',
      email:driver.user.email,
      'controller[fees][payer]':'application',
      'controller[losses][payments]':'application',
      'controller[stripe_dashboard][type]':'express',
      'metadata[driverProfileId]':driver.id,
    },`connect-account-${driver.id}`);
    await this.prisma.driverProfile.update({where:{id:driver.id},data:{stripeAccountId:account.id,stripeChargesEnabled:!!account.charges_enabled,stripePayoutsEnabled:!!account.payouts_enabled}});
    return {accountId:account.id,existing:false};
  }

  async connectOnboardingLink(driverUserId:string){
    const driver=await this.prisma.driverProfile.findUnique({where:{userId:driverUserId},include:{user:true}});
    if(!driver) throw new NotFoundException('Driver profile not found');
    const accountId=driver.stripeAccountId||(await this.createConnectAccount(driverUserId)).accountId;
    const refresh=process.env.STRIPE_CONNECT_REFRESH_URL||'https://example.com/uride/connect/refresh';
    const ret=process.env.STRIPE_CONNECT_RETURN_URL||'https://example.com/uride/connect/return';
    return this.stripe('account_links',{account:accountId,refresh_url:refresh,return_url:ret,type:'account_onboarding'});
  }

  async refreshConnectStatus(driverUserId:string){
    const driver=await this.prisma.driverProfile.findUnique({where:{userId:driverUserId}});
    if(!driver?.stripeAccountId) throw new NotFoundException('Stripe Connect account not found');
    const account=await this.stripe(`accounts/${driver.stripeAccountId}`,undefined,undefined,'GET');
    const updated=await this.prisma.driverProfile.update({where:{id:driver.id},data:{stripeChargesEnabled:!!account.charges_enabled,stripePayoutsEnabled:!!account.payouts_enabled}});
    return {accountId:account.id,chargesEnabled:updated.stripeChargesEnabled,payoutsEnabled:updated.stripePayoutsEnabled,detailsSubmitted:!!account.details_submitted};
  }

  async refundPayment(paymentId:string,body:any={}){
    const payment=await this.prisma.payment.findUnique({where:{id:paymentId}});
    if(!payment||payment.provider!=='STRIPE'||!payment.providerPaymentId) throw new NotFoundException('Stripe payment not found');
    if(!['SUCCEEDED','PARTIALLY_REFUNDED'].includes(payment.status)) throw new ConflictException('Payment is not refundable');
    const amount=body.amount===undefined?Number(payment.amount):Number(body.amount);
    if(!Number.isFinite(amount)||amount<=0||amount>Number(payment.amount)) throw new BadRequestException('Invalid refund amount');
    const refund=await this.stripe('refunds',{
      payment_intent:payment.providerPaymentId,
      amount:this.cents(amount),
      reverse_transfer:true,
      refund_application_fee:true,
      'metadata[uridePaymentId]':payment.id,
      'metadata[tripId]':payment.tripId,
    },body.idempotencyKey||`refund-${payment.id}-${this.cents(amount)}`);
    const full=this.cents(amount)>=this.cents(Number(payment.amount));
    const updated=await this.prisma.payment.update({where:{id:payment.id},data:{status:full?'REFUNDED':'PARTIALLY_REFUNDED'}});
    await this.prisma.tripEvent.create({data:{tripId:payment.tripId,type:full?'PAYMENT_REFUNDED':'PAYMENT_PARTIALLY_REFUNDED',metadata:{paymentId:payment.id,refundId:refund.id,amount}}});
    await this.earnings.recordRefundReversal(payment.id,refund.id,amount);
    this.realtime.publish(payment.tripId,'PAYMENT_REFUNDED',{paymentId:payment.id,refundId:refund.id,amount,full});
    return {refund,payment:updated};
  }

  async getTripPayments(tripId:string,actorUserId?:string,actorRole?:string){
    const trip=await this.prisma.trip.findUnique({where:{id:tripId},include:{driver:true}});
    if(!trip) throw new NotFoundException('Trip not found');
    if(actorUserId && actorRole!=='ADMIN' && trip.passengerUserId!==actorUserId && trip.driver?.userId!==actorUserId) throw new ForbiddenException('Trip payment access denied');
    return this.prisma.payment.findMany({where:{tripId},include:{receipt:true},orderBy:{createdAt:'desc'}});
  }

  async getReceipt(paymentId:string,actorUserId?:string,actorRole?:string){
    const payment=await this.prisma.payment.findUnique({where:{id:paymentId},include:{receipt:true,trip:{include:{vehicle:true,driver:true}}}});
    if(!payment) throw new NotFoundException('Payment not found');
    if(actorUserId && actorRole!=='ADMIN' && payment.trip.passengerUserId!==actorUserId && payment.trip.driver?.userId!==actorUserId) throw new ForbiddenException('Receipt access denied');
    if(!payment.receipt) throw new NotFoundException('Receipt is available only for a successful payment');
    return {paymentId:payment.id,status:payment.status,amount:payment.amount,currency:payment.currency,receipt:payment.receipt,trip:payment.trip};
  }
}
