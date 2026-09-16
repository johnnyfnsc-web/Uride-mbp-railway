import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private worker?: ReturnType<typeof setInterval>;
  private maintenance?: ReturnType<typeof setInterval>;
  constructor(private prisma:PrismaService){}

  onModuleInit(){
    if(String(process.env.ENABLE_NOTIFICATION_WORKER||'true').toLowerCase()==='false') return;
    this.worker=setInterval(()=>{ void this.processScheduledRideReminders(); },60_000);
    this.maintenance=setInterval(()=>{ void this.processDocumentExpiryNotifications(); },6*60*60_000);
    setTimeout(()=>{ void this.processScheduledRideReminders(); void this.processDocumentExpiryNotifications(); },5_000);
  }

  onModuleDestroy(){
    if(this.worker) clearInterval(this.worker);
    if(this.maintenance) clearInterval(this.maintenance);
  }

  async registerDevice(dto:any){
    if(!dto.userId||!dto.expoPushToken||!dto.platform||!dto.appVariant) throw new BadRequestException('userId, expoPushToken, platform and appVariant are required');
    const user=await this.prisma.user.findUnique({where:{id:dto.userId}});
    if(!user) throw new NotFoundException('User not found');
    if(!['IOS','ANDROID'].includes(String(dto.platform).toUpperCase())) throw new BadRequestException('platform must be IOS or ANDROID');
    if(!/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(dto.expoPushToken)) throw new BadRequestException('Invalid Expo push token');
    return this.prisma.devicePushToken.upsert({
      where:{expoPushToken:dto.expoPushToken},
      update:{userId:dto.userId,platform:String(dto.platform).toUpperCase() as any,deviceId:dto.deviceId||null,appVariant:dto.appVariant,isActive:true,lastSeenAt:new Date()},
      create:{userId:dto.userId,expoPushToken:dto.expoPushToken,platform:String(dto.platform).toUpperCase() as any,deviceId:dto.deviceId||null,appVariant:dto.appVariant},
    });
  }

  async unregisterDevice(dto:any){
    if(!dto.expoPushToken) throw new BadRequestException('expoPushToken is required');
    return this.prisma.devicePushToken.updateMany({where:{expoPushToken:dto.expoPushToken},data:{isActive:false}});
  }

  devices(userId:string){
    return this.prisma.devicePushToken.findMany({where:{userId},orderBy:{lastSeenAt:'desc'}});
  }

  history(userId:string){
    return this.prisma.notificationDelivery.findMany({where:{userId},orderBy:{createdAt:'desc'},take:100});
  }

  async sendToUser(userId:string,type:string,title:string,body:string,data:any={}){
    const delivery=await this.prisma.notificationDelivery.create({data:{userId,type,title,body,data}});
    const tokens=await this.prisma.devicePushToken.findMany({where:{userId,isActive:true}});
    if(!tokens.length){
      await this.prisma.notificationDelivery.update({where:{id:delivery.id},data:{status:'FAILED',failureMessage:'No active push tokens'}});
      return {deliveryId:delivery.id,sent:0,reason:'NO_ACTIVE_TOKENS'};
    }
    const messages=tokens.map(t=>({to:t.expoPushToken,sound:'default',title,body,data:{...data,notificationType:type}}));
    try{
      const headers:any={'Content-Type':'application/json','Accept':'application/json','Accept-Encoding':'gzip, deflate'};
      if(process.env.EXPO_ACCESS_TOKEN) headers.Authorization=`Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
      const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers,body:JSON.stringify(messages)});
      const result:any=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result?.errors?.[0]?.message||`Expo push HTTP ${response.status}`);
      const tickets=Array.isArray(result?.data)?result.data:[result?.data].filter(Boolean);
      const firstId=tickets.find((x:any)=>x?.id)?.id||null;
      const errors=tickets.filter((x:any)=>x?.status==='error');
      if(errors.length===tickets.length&&tickets.length){
        await this.prisma.notificationDelivery.update({where:{id:delivery.id},data:{status:'FAILED',failureMessage:errors.map((x:any)=>x.message||x.details?.error).join('; ')}});
      }else{
        await this.prisma.notificationDelivery.update({where:{id:delivery.id},data:{status:'SENT',providerMessageId:firstId,sentAt:new Date(),failureMessage:errors.length?`${errors.length} token(s) failed`:null}});
      }
      for(let i=0;i<tickets.length;i++){
        const ticket=tickets[i], token=tokens[i];
        if(ticket?.status==='error'&&ticket?.details?.error==='DeviceNotRegistered'&&token){
          await this.prisma.devicePushToken.update({where:{id:token.id},data:{isActive:false}});
        }
      }
      return {deliveryId:delivery.id,sent:tokens.length,tickets};
    }catch(e:any){
      await this.prisma.notificationDelivery.update({where:{id:delivery.id},data:{status:'FAILED',failureMessage:e.message||'Push provider failure'}});
      return {deliveryId:delivery.id,sent:0,error:e.message||'Push provider failure'};
    }
  }

  async processScheduledRideReminders(){
    const now=new Date(), in24h=new Date(Date.now()+24*60*60*1000);
    const trips=await this.prisma.trip.findMany({
      where:{status:'SCHEDULED',scheduledFor:{gt:now,lte:in24h}},
      orderBy:{scheduledFor:'asc'},
      take:500,
    });
    let sent=0;
    for(const trip of trips){
      const ms=(trip.scheduledFor as Date).getTime()-Date.now();
      if(ms<=60*60*1000 && !trip.reminder1hSentAt){
        await this.sendToUser(trip.passengerUserId,'SCHEDULED_RIDE_1H','Tu viaje URide es pronto','Tu URide programado sale aproximadamente en 1 hora.',{tripId:trip.id,scheduledFor:trip.scheduledFor});
        await this.prisma.trip.update({where:{id:trip.id},data:{reminder1hSentAt:new Date()}});
        sent++;
      }else if(ms<=24*60*60*1000 && !trip.reminder24hSentAt){
        await this.sendToUser(trip.passengerUserId,'SCHEDULED_RIDE_24H','Recordatorio de viaje URide','Tienes un URide programado dentro de las próximas 24 horas.',{tripId:trip.id,scheduledFor:trip.scheduledFor});
        await this.prisma.trip.update({where:{id:trip.id},data:{reminder24hSentAt:new Date()}});
        sent++;
      }
    }
    return {checked:trips.length,sent,processedAt:new Date()};
  }

  async processDocumentExpiryNotifications(){
    const now=new Date(), in30=new Date(Date.now()+30*24*60*60*1000), in7=new Date(Date.now()+7*24*60*60*1000);
    const docs=await this.prisma.driverDocument.findMany({
      where:{status:'APPROVED',expiresAt:{gt:now,lte:in30}},
      include:{driverProfile:{select:{userId:true}}},
    });
    const results:any[]=[];
    for(const d of docs){
      const days=Math.max(1,Math.ceil(((d.expiresAt as Date).getTime()-Date.now())/(24*60*60*1000)));
      const type=days<=7?'DOCUMENT_EXPIRES_7D':'DOCUMENT_EXPIRES_30D';
      const recent=await this.prisma.notificationDelivery.findFirst({where:{userId:d.driverProfile.userId,type,data:{path:['documentId'],equals:d.id},createdAt:{gte:new Date(Date.now()-(days<=7?6:20)*24*60*60*1000)}}});
      if(recent) continue;
      results.push(await this.sendToUser(d.driverProfile.userId,type,'Documento de URide próximo a vencer',`${d.type} vence en aproximadamente ${days} día(s). Actualízalo para mantenerte activo.`,{documentId:d.id,expiresAt:d.expiresAt}));
    }
    return {checked:docs.length,notifications:results.length,results};
  }
}
