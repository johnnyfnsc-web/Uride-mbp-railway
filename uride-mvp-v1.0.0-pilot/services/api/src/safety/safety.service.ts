import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SafetyService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
  ) {}

  private priorityFor(type:string){
    if(type==='SOS'||type==='MEDICAL'||type==='ACCIDENT') return 'CRITICAL';
    if(type==='HARASSMENT'||type==='ROUTE_DEVIATION') return 'HIGH';
    if(type==='UNUSUAL_STOP'||type==='VEHICLE_ISSUE') return 'MEDIUM';
    return 'LOW';
  }

  private async assertParticipant(tripId:string,userId:string){
    const trip=await this.prisma.trip.findUnique({where:{id:tripId},include:{driver:true}});
    if(!trip) throw new NotFoundException('Trip not found');
    const participant=userId===trip.passengerUserId||userId===trip.driver?.userId;
    if(!participant) throw new BadRequestException('User did not participate in this trip');
    return trip;
  }

  async addTrustedContact(dto:any){
    if(!dto.userId||!dto.name||(!dto.phone&&!dto.email)) throw new BadRequestException('userId, name and phone or email are required');
    const user=await this.prisma.user.findUnique({where:{id:dto.userId}});
    if(!user) throw new NotFoundException('User not found');
    if(dto.isPrimary) await this.prisma.trustedContact.updateMany({where:{userId:dto.userId},data:{isPrimary:false}});
    return this.prisma.trustedContact.create({
      data:{userId:dto.userId,name:dto.name,phone:dto.phone||null,email:dto.email||null,isPrimary:!!dto.isPrimary},
    });
  }

  contacts(userId:string){
    return this.prisma.trustedContact.findMany({where:{userId},orderBy:[{isPrimary:'desc'},{createdAt:'asc'}]});
  }

  async createIncident(tripId:string,dto:any){
    const trip=await this.prisma.trip.findUnique({where:{id:tripId},include:{driver:true}});
    if(!trip) throw new NotFoundException('Trip not found');

    const reporterUserId=dto.reporterUserId||null;
    let reporterRole:any=String(dto.reporterRole||'SYSTEM').toUpperCase();
    if(reporterUserId===trip.passengerUserId) reporterRole='PASSENGER';
    else if(reporterUserId&&trip.driver?.userId===reporterUserId) reporterRole='DRIVER';
    else if(reporterUserId) throw new BadRequestException('Reporter did not participate in this trip');
    if(!['PASSENGER','DRIVER','SYSTEM'].includes(reporterRole)) throw new BadRequestException('Invalid reporter');

    const allowed=['SOS','ROUTE_DEVIATION','UNUSUAL_STOP','ACCIDENT','MEDICAL','HARASSMENT','VEHICLE_ISSUE','OTHER'];
    const type=String(dto.type||'OTHER').toUpperCase();
    if(!allowed.includes(type)) throw new BadRequestException('Invalid incident type');

    const incident=await this.prisma.safetyIncident.create({
      data:{
        tripId,reporterUserId,reporterRole,type:type as any,priority:this.priorityFor(type) as any,
        message:dto.message||null,
        lat:Number.isFinite(Number(dto.lat))?Number(dto.lat):null,
        lng:Number.isFinite(Number(dto.lng))?Number(dto.lng):null,
        metadata:dto.metadata||undefined,
      },
      include:{actions:true},
    });

    await this.prisma.tripEvent.create({
      data:{tripId,type:type==='SOS'?'SOS_ACTIVATED':'SAFETY_INCIDENT_REPORTED',actorUserId:reporterUserId,metadata:{incidentId:incident.id,incidentType:type,priority:incident.priority}},
    });

    if(['CRITICAL','HIGH'].includes(String(incident.priority))){
      const admins=await this.prisma.user.findMany({where:{role:'ADMIN',isActive:true},select:{id:true}});
      for(const admin of admins){
        await this.notifications.sendToUser(admin.id,'OPERATIONS_SAFETY_ALERT',incident.priority==='CRITICAL'?'Alerta crítica URide':'Alerta de seguridad URide',`${type} en viaje ${tripId}. Abre Operations para responder.`,{tripId,incidentId:incident.id,type,priority:incident.priority});
      }
    }

    const counterpart=reporterRole==='PASSENGER'?trip.driver?.userId:reporterRole==='DRIVER'?trip.passengerUserId:null;
    if(counterpart){
      await this.notifications.sendToUser(counterpart,'SAFETY_ALERT','Alerta de seguridad URide','Hay una alerta de seguridad activa relacionada con este viaje. Abre URide para ver el estado.',{tripId,incidentId:incident.id,type});
    }

    this.realtime.publish(tripId,type==='SOS'?'SOS_ACTIVATED':'SAFETY_INCIDENT',{
      incidentId:incident.id,type,priority:incident.priority,lat:incident.lat,lng:incident.lng,
    });
    return incident;
  }

  tripIncidents(tripId:string){
    return this.prisma.safetyIncident.findMany({
      where:{tripId},
      include:{actions:{orderBy:{createdAt:'asc'}}},
      orderBy:{createdAt:'desc'},
    });
  }

  async monitorSnapshot(tripId:string){
    const trip=await this.prisma.trip.findUnique({
      where:{id:tripId},
      include:{
        passenger:{select:{id:true,email:true,phone:true}},
        driver:{include:{user:{select:{id:true,email:true,phone:true}}}},
        vehicle:true,
        locations:{orderBy:{recordedAt:'desc'},take:30},
        safetyIncidents:{where:{status:{in:['OPEN','ACKNOWLEDGED']}},include:{actions:{orderBy:{createdAt:'asc'}}},orderBy:{createdAt:'desc'}},
      },
    });
    if(!trip) throw new NotFoundException('Trip not found');
    return {
      tripId:trip.id,status:trip.status,
      pickup:{address:trip.pickupAddress,lat:trip.pickupLat,lng:trip.pickupLng},
      destination:{address:trip.destinationAddress,lat:trip.destinationLat,lng:trip.destinationLng},
      passenger:trip.passenger,
      driver:trip.driver?{id:trip.driver.id,firstName:trip.driver.firstName,lastName:trip.driver.lastName,user:trip.driver.user}:null,
      vehicle:trip.vehicle,
      latestLocation:trip.locations[0]||null,
      recentLocations:trip.locations,
      activeIncidents:trip.safetyIncidents,
      updatedAt:trip.updatedAt,
    };
  }

  async shareSnapshot(tripId:string){
    const trip=await this.prisma.trip.findUnique({
      where:{id:tripId},
      include:{driver:true,vehicle:true,locations:{orderBy:{recordedAt:'desc'},take:1}},
    });
    if(!trip) throw new NotFoundException('Trip not found');
    return {
      tripId:trip.id,status:trip.status,pickupAddress:trip.pickupAddress,destinationAddress:trip.destinationAddress,
      driver:trip.driver?{firstName:trip.driver.firstName,lastNameInitial:trip.driver.lastName?.slice(0,1)||''}:null,
      vehicle:trip.vehicle?{make:trip.vehicle.make,model:trip.vehicle.model,color:trip.vehicle.color,plate:trip.vehicle.plate}:null,
      lastLocation:trip.locations[0]?{lat:trip.locations[0].lat,lng:trip.locations[0].lng,recordedAt:trip.locations[0].recordedAt}:null,
      updatedAt:trip.updatedAt,
    };
  }

  async createShareLink(tripId:string,dto:any){
    if(!dto.userId) throw new BadRequestException('userId is required');
    await this.assertParticipant(tripId,dto.userId);
    const token=randomBytes(32).toString('base64url');
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const expiresInMinutes=Math.max(15,Math.min(Number(dto.expiresInMinutes||240),1440));
    const expiresAt=new Date(Date.now()+expiresInMinutes*60_000);
    const link=await this.prisma.safetyShareLink.create({data:{tripId,ownerUserId:dto.userId,tokenHash,expiresAt}});
    return {id:link.id,token,expiresAt,sharePath:`/v1/safety/share/${token}`};
  }

  async resolveShareLink(token:string){
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const link=await this.prisma.safetyShareLink.findUnique({where:{tokenHash}});
    if(!link||link.revokedAt||link.expiresAt<=new Date()) throw new NotFoundException('Share link is invalid or expired');
    return this.shareSnapshot(link.tripId);
  }

  async revokeShareLink(id:string,dto:any){
    const link=await this.prisma.safetyShareLink.findUnique({where:{id}});
    if(!link) throw new NotFoundException('Share link not found');
    if(link.ownerUserId!==dto.userId) throw new BadRequestException('Only the owner can revoke this share link');
    return this.prisma.safetyShareLink.update({where:{id},data:{revokedAt:new Date()}});
  }
}
