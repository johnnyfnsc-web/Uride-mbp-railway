import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class EarningsService {
  constructor(private prisma:PrismaService){}

  private async driverByUser(userId:string){
    const d=await this.prisma.driverProfile.findUnique({where:{userId}});
    if(!d) throw new NotFoundException('Driver profile not found');
    return d;
  }

  private range(period:string){
    const now=new Date();
    const p=String(period||'WEEK').toUpperCase();
    if(p==='DAY') return {from:new Date(now.getFullYear(),now.getMonth(),now.getDate()),to:now,label:'DAY'};
    if(p==='MONTH') return {from:new Date(now.getFullYear(),now.getMonth(),1),to:now,label:'MONTH'};
    const day=now.getDay();
    const diff=(day+6)%7;
    return {from:new Date(now.getFullYear(),now.getMonth(),now.getDate()-diff),to:now,label:'WEEK'};
  }

  async recordSuccessfulPayment(paymentId:string){
    const payment=await this.prisma.payment.findUnique({
      where:{id:paymentId},
      include:{trip:{include:{driver:true}}},
    });
    if(!payment||payment.status!=='SUCCEEDED'||!payment.trip.driverProfileId) return {recorded:false,reason:'NOT_ELIGIBLE'};
    const subtotal=Number(payment.subtotal??payment.amount);
    const tip=Number(payment.tip??0);
    const platformFee=Number(payment.platformFee??0);
    const fareNet=Math.max(0,Number((subtotal-platformFee).toFixed(2)));

    await this.prisma.$transaction(async tx=>{
      await tx.driverLedgerEntry.upsert({
        where:{externalKey:`payment:${payment.id}:trip`},
        update:{amount:fareNet,status:'AVAILABLE',availableAt:new Date()},
        create:{
          externalKey:`payment:${payment.id}:trip`,driverProfileId:payment.trip.driverProfileId as string,paymentId:payment.id,tripId:payment.tripId,
          type:'TRIP_EARNING',status:'AVAILABLE',amount:fareNet,availableAt:new Date(),
          description:'Ganancia neta del viaje',
          metadata:{subtotal,platformFee},
        },
      });
      if(tip>0){
        await tx.driverLedgerEntry.upsert({
          where:{externalKey:`payment:${payment.id}:tip`},
          update:{amount:tip,status:'AVAILABLE',availableAt:new Date()},
          create:{
            externalKey:`payment:${payment.id}:tip`,driverProfileId:payment.trip.driverProfileId as string,paymentId:payment.id,tripId:payment.tripId,
            type:'TIP',status:'AVAILABLE',amount:tip,availableAt:new Date(),
            description:'Propina del pasajero',
          },
        });
      }
    });
    await this.evaluateBonuses(payment.trip.driverProfileId as string);
    return {recorded:true,fareNet,tip,driverTotal:Number((fareNet+tip).toFixed(2))};
  }

  async recordRefundReversal(paymentId:string,refundId:string,amount:number){
    const payment=await this.prisma.payment.findUnique({where:{id:paymentId},include:{trip:true}});
    if(!payment?.trip.driverProfileId) return {recorded:false};
    const paidTotal=Number(payment.amount);
    if(paidTotal<=0) return {recorded:false};
    const driverBase=Number(payment.driverAmount??0);
    const driverShare=Math.min(driverBase,Number((driverBase*(amount/paidTotal)).toFixed(2)));
    const existing=await this.prisma.driverLedgerEntry.findUnique({where:{externalKey:`refund:${refundId}`}});
    if(existing) return {recorded:false,idempotentReplay:true};
    const entry=await this.prisma.driverLedgerEntry.create({
      data:{
        externalKey:`refund:${refundId}`,driverProfileId:payment.trip.driverProfileId,paymentId:payment.id,tripId:payment.tripId,type:'REFUND_REVERSAL',
        status:'AVAILABLE',amount:-Math.abs(driverShare),availableAt:new Date(),description:'Ajuste por reembolso',
        metadata:{refundId,refundAmount:amount},
      },
    });
    return {recorded:true,entry};
  }

  async summary(driverUserId:string,period:string){
    const driver=await this.driverByUser(driverUserId);
    const r=this.range(period);
    const entries=await this.prisma.driverLedgerEntry.findMany({
      where:{driverProfileId:driver.id,createdAt:{gte:r.from,lte:r.to}},
      orderBy:{createdAt:'desc'},
    });
    const sum=(type:string)=>entries.filter(e=>e.type===type).reduce((a,e)=>a+Number(e.amount),0);
    const tripEarnings=sum('TRIP_EARNING');
    const tips=sum('TIP');
    const bonuses=sum('BONUS');
    const adjustments=sum('ADJUSTMENT')+sum('REFUND_REVERSAL');
    const total=Number((tripEarnings+tips+bonuses+adjustments).toFixed(2));
    const tripIds=new Set(entries.filter(e=>e.type==='TRIP_EARNING'&&e.tripId).map(e=>e.tripId));
    const hours=await this.estimatedOnlineHours(driver.id,r.from,r.to);
    return {
      period:r.label,from:r.from,to:r.to,currency:'USD',
      completedPaidTrips:tripIds.size,
      tripEarnings:Number(tripEarnings.toFixed(2)),
      tips:Number(tips.toFixed(2)),
      bonuses:Number(bonuses.toFixed(2)),
      adjustments:Number(adjustments.toFixed(2)),
      total,
      recordedTripHours:hours,
      estimatedPerTripHour:hours>0?Number((total/hours).toFixed(2)):0,
    };
  }

  private async estimatedOnlineHours(driverProfileId:string,from:Date,to:Date){
    const trips=await this.prisma.trip.findMany({
      where:{driverProfileId,status:'COMPLETED',completedAt:{gte:from,lte:to},startedAt:{not:null}},
      select:{startedAt:true,completedAt:true},
    });
    const seconds=trips.reduce((s,t)=>s+(t.completedAt&&t.startedAt?Math.max(0,(t.completedAt.getTime()-t.startedAt.getTime())/1000):0),0);
    return Number((seconds/3600).toFixed(2));
  }

  async history(driverUserId:string,limit=100){
    const driver=await this.driverByUser(driverUserId);
    return this.prisma.driverLedgerEntry.findMany({
      where:{driverProfileId:driver.id},
      orderBy:{createdAt:'desc'},
      take:Math.max(1,Math.min(limit,250)),
    });
  }

  async bonusProgress(driverUserId:string){
    const driver=await this.driverByUser(driverUserId);
    const now=new Date();
    const campaigns=await this.prisma.driverBonusCampaign.findMany({
      where:{isActive:true,startsAt:{lte:now},endsAt:{gte:now}},
      orderBy:{endsAt:'asc'},
    });
    const result:any[]=[];
    for(const c of campaigns){
      const qualifyingTrips=await this.prisma.trip.count({
        where:{
          driverProfileId:driver.id,status:'COMPLETED',
          completedAt:{gte:c.startsAt,lte:c.endsAt},
          payments:{some:{status:'SUCCEEDED'}},
          ...(c.serviceType?{serviceType:c.serviceType}:{})
        },
      });
      const award=await this.prisma.driverBonusAward.findUnique({where:{campaignId_driverProfileId:{campaignId:c.id,driverProfileId:driver.id}}});
      result.push({
        campaignId:c.id,name:c.name,description:c.description,targetTrips:c.targetTrips,rewardAmount:Number(c.rewardAmount),
        qualifyingTrips,remainingTrips:Math.max(0,c.targetTrips-qualifyingTrips),awarded:!!award,endsAt:c.endsAt,
      });
    }
    return result;
  }

  async evaluateBonusesByUser(driverUserId:string){
    const d=await this.driverByUser(driverUserId);
    return this.evaluateBonuses(d.id);
  }

  async evaluateBonuses(driverProfileId:string){
    const now=new Date();
    const campaigns=await this.prisma.driverBonusCampaign.findMany({where:{isActive:true,startsAt:{lte:now},endsAt:{gte:now}}});
    const awards:any[]=[];
    for(const c of campaigns){
      const existing=await this.prisma.driverBonusAward.findUnique({where:{campaignId_driverProfileId:{campaignId:c.id,driverProfileId}}});
      if(existing) continue;
      const qualifyingTrips=await this.prisma.trip.count({
        where:{driverProfileId,status:'COMPLETED',completedAt:{gte:c.startsAt,lte:c.endsAt},payments:{some:{status:'SUCCEEDED'}},...(c.serviceType?{serviceType:c.serviceType}:{})},
      });
      if(qualifyingTrips<c.targetTrips) continue;
      const award=await this.prisma.$transaction(async tx=>{
        const a=await tx.driverBonusAward.create({
          data:{campaignId:c.id,driverProfileId,qualifyingTrips,rewardAmount:c.rewardAmount},
        });
        await tx.driverLedgerEntry.create({
          data:{
            externalKey:`bonus:${a.id}`,driverProfileId,bonusAwardId:a.id,type:'BONUS',status:'AVAILABLE',amount:c.rewardAmount,availableAt:new Date(),
            description:`Bono: ${c.name}`,metadata:{campaignId:c.id,qualifyingTrips},
          },
        });
        return a;
      });
      awards.push(award);
    }
    return {awardsCreated:awards.length,awards};
  }

  async createBonusCampaign(dto:any){
    const name=String(dto.name||'').trim();
    const targetTrips=Number(dto.targetTrips);
    const rewardAmount=Number(dto.rewardAmount);
    const startsAt=new Date(dto.startsAt),endsAt=new Date(dto.endsAt);
    if(!name||!Number.isInteger(targetTrips)||targetTrips<1||!Number.isFinite(rewardAmount)||rewardAmount<=0) throw new BadRequestException('Valid name, targetTrips and rewardAmount are required');
    if(Number.isNaN(startsAt.getTime())||Number.isNaN(endsAt.getTime())||endsAt<=startsAt) throw new BadRequestException('Valid campaign dates are required');
    return this.prisma.driverBonusCampaign.create({
      data:{name,description:dto.description||null,serviceType:dto.serviceType||null,targetTrips,rewardAmount,startsAt,endsAt,isActive:dto.isActive!==false},
    });
  }

  listBonusCampaigns(){
    return this.prisma.driverBonusCampaign.findMany({orderBy:{createdAt:'desc'},take:100});
  }

  setBonusCampaignActive(id:string,isActive:boolean){
    return this.prisma.driverBonusCampaign.update({where:{id},data:{isActive}});
  }
}
