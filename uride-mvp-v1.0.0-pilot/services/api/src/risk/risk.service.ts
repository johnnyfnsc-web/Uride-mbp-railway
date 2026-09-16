import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RiskService {
  constructor(private prisma:PrismaService, private notifications:NotificationsService){}

  private thresholds(){
    const medium=Math.max(1,Math.min(99,Number(process.env.RISK_MEDIUM_THRESHOLD||25)));
    const high=Math.max(medium+1,Math.min(99,Number(process.env.RISK_HIGH_THRESHOLD||55)));
    const critical=Math.max(high+1,Math.min(100,Number(process.env.RISK_CRITICAL_THRESHOLD||80)));
    return {medium,high,critical};
  }

  private level(score:number){
    const t=this.thresholds();
    if(score>=t.critical) return 'CRITICAL';
    if(score>=t.high) return 'HIGH';
    if(score>=t.medium) return 'MEDIUM';
    return 'LOW';
  }

  private weight(type:string){
    const map:any={
      PAYMENT_FAILURE:8,
      REPEATED_PAYMENT_FAILURE:22,
      EXCESSIVE_CANCELLATIONS:20,
      DEVICE_REUSE:25,
      RAPID_ACCOUNT_CREATION:15,
      REFUND_ABUSE:25,
      CHARGEBACK:45,
      SUSPICIOUS_LOCATION:20,
      PROMO_ABUSE:20,
      MANUAL:30,
      OTHER:10,
    };
    return map[type]??10;
  }

  async registerDevice(dto:any){
    if(!dto.userId||!dto.deviceId) throw new BadRequestException('userId and deviceId are required');
    const user=await this.prisma.user.findUnique({where:{id:dto.userId}});
    if(!user) throw new NotFoundException('User not found');
    const deviceHash=createHash('sha256').update(String(dto.deviceId)).digest('hex');
    await this.prisma.riskDevice.upsert({
      where:{userId_deviceHash:{userId:dto.userId,deviceHash}},
      update:{lastSeenAt:new Date(),platform:dto.platform||undefined},
      create:{userId:dto.userId,deviceHash,platform:dto.platform||null},
    });
    const otherUsers=await this.prisma.riskDevice.findMany({where:{deviceHash,userId:{not:dto.userId}},select:{userId:true}});
    if(otherUsers.length){
      const recent=await this.prisma.riskSignal.findFirst({where:{userId:dto.userId,type:'DEVICE_REUSE',deviceHash,createdAt:{gte:new Date(Date.now()-7*24*60*60*1000)}}});
      if(!recent) await this.addSignal(dto.userId,'DEVICE_REUSE',{deviceHash,metadata:{otherAccountCount:otherUsers.length}});
      const recentAccounts=await this.prisma.user.count({where:{id:{in:[dto.userId,...otherUsers.map(x=>x.userId)]},createdAt:{gte:new Date(Date.now()-24*60*60*1000)}}});
      if(recentAccounts>=2){
        const rapid=await this.prisma.riskSignal.findFirst({where:{userId:dto.userId,type:'RAPID_ACCOUNT_CREATION',deviceHash,createdAt:{gte:new Date(Date.now()-24*60*60*1000)}}});
        if(!rapid) await this.addSignal(dto.userId,'RAPID_ACCOUNT_CREATION',{deviceHash,metadata:{recentAccountsSameDevice:recentAccounts}});
      }
    }
    return {registered:true,deviceHashPrefix:deviceHash.slice(0,12),otherAccountCount:otherUsers.length};
  }

  async addSignal(userId:string,type:string,opts:any={}){
    const allowed=['PAYMENT_FAILURE','REPEATED_PAYMENT_FAILURE','EXCESSIVE_CANCELLATIONS','DEVICE_REUSE','RAPID_ACCOUNT_CREATION','REFUND_ABUSE','CHARGEBACK','SUSPICIOUS_LOCATION','PROMO_ABUSE','MANUAL','OTHER'];
    if(!allowed.includes(type)) throw new BadRequestException('Invalid risk signal');
    const user=await this.prisma.user.findUnique({where:{id:userId}});
    if(!user) throw new NotFoundException('User not found');
    const signal=await this.prisma.riskSignal.create({
      data:{
        userId,tripId:opts.tripId||null,paymentId:opts.paymentId||null,type:type as any,
        weight:Math.max(1,Math.min(100,Number(opts.weight??this.weight(type)))),
        deviceHash:opts.deviceHash||null,metadata:opts.metadata||undefined,
      },
    });
    await this.recalculate(userId);
    return signal;
  }

  async recalculate(userId:string){
    const user=await this.prisma.user.findUnique({where:{id:userId}});
    if(!user) throw new NotFoundException('User not found');
    const since=new Date(Date.now()-90*24*60*60*1000);
    const signals=await this.prisma.riskSignal.findMany({where:{userId,createdAt:{gte:since}},orderBy:{createdAt:'desc'}});
    const weighted=signals.reduce((sum,s)=>sum+s.weight,0);
    const score=Math.min(100,weighted);
    const level=this.level(score) as any;
    const updated=await this.prisma.user.update({where:{id:userId},data:{riskScore:score,riskLevel:level}});

    if(score>=this.thresholds().high){
      const existing=await this.prisma.riskCase.findFirst({where:{userId,status:{in:['OPEN','REVIEWING','RESTRICTED']}}});
      if(!existing){
        const c=await this.prisma.riskCase.create({data:{userId,level,scoreAtOpen:score}});
        const admins=await this.prisma.user.findMany({where:{role:'ADMIN',isActive:true},select:{id:true}});
        for(const a of admins){
          await this.notifications.sendToUser(a.id,'RISK_CASE_OPENED','Revisión de riesgo URide',`Cuenta con nivel ${level} y score ${score}. Revisar en Operations.`,{riskCaseId:c.id,userId,level,score});
        }
      }else if(existing.level!==level){
        await this.prisma.riskCase.update({where:{id:existing.id},data:{level}});
      }
    }
    return {userId,score,level,signalCount:signals.length,tripRequestsBlockedUntil:updated.tripRequestsBlockedUntil,paymentsBlockedUntil:updated.paymentsBlockedUntil};
  }

  async evaluateCancellationPattern(userId:string){
    const since=new Date(Date.now()-7*24*60*60*1000);
    const trips=await this.prisma.trip.count({where:{passengerUserId:userId,createdAt:{gte:since}}});
    const cancellations=await this.prisma.trip.count({where:{passengerUserId:userId,cancelledAt:{gte:since},cancellationActor:'PASSENGER'}});
    if(trips>=5 && cancellations>=4 && cancellations/trips>=0.6){
      const recent=await this.prisma.riskSignal.findFirst({where:{userId,type:'EXCESSIVE_CANCELLATIONS',createdAt:{gte:new Date(Date.now()-24*60*60*1000)}}});
      if(!recent) await this.addSignal(userId,'EXCESSIVE_CANCELLATIONS',{metadata:{trips7d:trips,cancellations7d:cancellations}});
    }
  }

  async evaluatePaymentFailure(userId:string,paymentId:string,tripId:string){
    const prior=await this.prisma.riskSignal.findFirst({where:{userId,paymentId,type:'PAYMENT_FAILURE'}});
    if(!prior) await this.addSignal(userId,'PAYMENT_FAILURE',{paymentId,tripId});
    const since=new Date(Date.now()-24*60*60*1000);
    const failures=await this.prisma.riskSignal.count({where:{userId,type:'PAYMENT_FAILURE',createdAt:{gte:since}}});
    if(failures>=3){
      const recent=await this.prisma.riskSignal.findFirst({where:{userId,type:'REPEATED_PAYMENT_FAILURE',createdAt:{gte:since}}});
      if(!recent) await this.addSignal(userId,'REPEATED_PAYMENT_FAILURE',{paymentId,tripId,metadata:{paymentFailures24h:failures}});
    }
  }

  async assertTripRequestAllowed(userId:string){
    const user=await this.prisma.user.findUnique({where:{id:userId}});
    if(!user) throw new NotFoundException('User not found');
    if(!user.isActive) throw new BadRequestException('Account is inactive');
    if(user.tripRequestsBlockedUntil && user.tripRequestsBlockedUntil>new Date()) throw new BadRequestException('Trip requests are temporarily restricted while URide reviews the account');
    return user;
  }

  async assertPaymentAllowed(userId:string){
    const user=await this.prisma.user.findUnique({where:{id:userId}});
    if(!user) throw new NotFoundException('User not found');
    if(!user.isActive) throw new BadRequestException('Account is inactive');
    if(user.paymentsBlockedUntil && user.paymentsBlockedUntil>new Date()) throw new BadRequestException('Payments are temporarily restricted while URide reviews the account');
    return user;
  }

  async summary(userId:string){
    const user=await this.prisma.user.findUnique({
      where:{id:userId},
      select:{id:true,riskScore:true,riskLevel:true,tripRequestsBlockedUntil:true,paymentsBlockedUntil:true},
    });
    if(!user) throw new NotFoundException('User not found');
    const [signals,cases,devices]=await Promise.all([
      this.prisma.riskSignal.findMany({where:{userId},orderBy:{createdAt:'desc'},take:50}),
      this.prisma.riskCase.findMany({where:{userId},orderBy:{createdAt:'desc'},take:20}),
      this.prisma.riskDevice.findMany({where:{userId},orderBy:{lastSeenAt:'desc'},take:20}),
    ]);
    return {...user,signals,cases,devices:devices.map(d=>({...d,deviceHash:d.deviceHash.slice(0,12)+'…'}))};
  }
}
