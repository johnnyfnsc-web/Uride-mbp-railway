import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UserGuard } from '../auth/user.guard';

@UseGuards(UserGuard)
@Controller('v1/drivers')
export class DriversController {
  constructor(private prisma: PrismaService, private realtime: RealtimeService) {}
  private own(req:any,userId:string){ if(req.userRole!=='DRIVER'||req.userId!==userId) throw new ForbiddenException('Driver access denied'); }

  private async complianceForDriver(driver:any) {
    const now=new Date();
    const documents=await this.prisma.driverDocument.findMany({where:{driverProfileId:driver.id}});
    const license=documents.find((d:any)=>d.type==='DRIVER_LICENSE'&&d.status==='APPROVED'&&(!d.expiresAt||d.expiresAt>now));
    const approvedVehicles=(driver.vehicles||[]).filter((v:any)=>v.status==='APPROVED');
    const vehicleCompliance=approvedVehicles.map((v:any)=>{
      const registration=documents.find((d:any)=>d.vehicleId===v.id&&d.type==='VEHICLE_REGISTRATION'&&d.status==='APPROVED'&&(!d.expiresAt||d.expiresAt>now));
      const insurance=documents.find((d:any)=>d.vehicleId===v.id&&d.type==='VEHICLE_INSURANCE'&&d.status==='APPROVED'&&(!d.expiresAt||d.expiresAt>now));
      return {vehicleId:v.id,registrationOk:!!registration,insuranceOk:!!insurance,eligible:!!registration&&!!insurance};
    });
    return {
      licenseOk:!!license,
      vehicleCompliance,
      eligibleToDrive:!!license&&vehicleCompliance.some((v:any)=>v.eligible),
      expiredDocumentIds:documents.filter((d:any)=>d.expiresAt&&d.expiresAt<=now&&d.status!=='EXPIRED').map((d:any)=>d.id),
    };
  }

  private milesBetween(lat1:number,lng1:number,lat2:number,lng2:number) {
    const rad=(v:number)=>(v*Math.PI)/180, R=3958.7613;
    const dLat=rad(lat2-lat1), dLng=rad(lng2-lng1);
    const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  }

  private distanceFromRouteCorridorMiles(trip:any, lat:number, lng:number) {
    // Foundation heuristic: compare current point to the straight pickup→destination corridor.
    // Production should use the route geometry/map-matching provider.
    const ax=trip.pickupLng, ay=trip.pickupLat, bx=trip.destinationLng, by=trip.destinationLat;
    const px=lng, py=lat, dx=bx-ax, dy=by-ay;
    const denom=dx*dx+dy*dy || 1;
    const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/denom));
    const projLat=ay+t*dy, projLng=ax+t*dx;
    return this.milesBetween(lat,lng,projLat,projLng);
  }

  @Post(':userId/documents')
  async addDocument(@Param('userId') userId:string,@Body() b:any,@Req() req:any){ this.own(req,userId);
    const driver=await this.prisma.driverProfile.findUnique({where:{userId},include:{vehicles:true}});
    if(!driver) throw new NotFoundException('Driver profile not found');
    const allowed=['DRIVER_LICENSE','VEHICLE_REGISTRATION','VEHICLE_INSURANCE','VEHICLE_INSPECTION','OTHER'];
    const type=String(b.type||'').toUpperCase();
    if(!allowed.includes(type)) throw new BadRequestException('Invalid document type');
    if(!b.storageKey?.trim()) throw new BadRequestException('storageKey is required');
    if(['VEHICLE_REGISTRATION','VEHICLE_INSURANCE','VEHICLE_INSPECTION'].includes(type)){
      if(!b.vehicleId || !driver.vehicles.some((v:any)=>v.id===b.vehicleId)) throw new BadRequestException('A valid driver vehicle is required for this document');
    }
    const expiresAt=b.expiresAt?new Date(b.expiresAt):null;
    if(expiresAt && Number.isNaN(expiresAt.getTime())) throw new BadRequestException('Invalid expiration date');
    const doc=await this.prisma.driverDocument.create({data:{
      driverProfileId:driver.id,vehicleId:b.vehicleId||null,type:type as any,status:'PENDING_REVIEW',
      documentNumberMasked:b.documentNumberMasked||null,storageKey:b.storageKey.trim(),
      issuedAt:b.issuedAt?new Date(b.issuedAt):null,expiresAt,
    }});
    if(driver.status==='DRAFT') await this.prisma.driverProfile.update({where:{id:driver.id},data:{status:'PENDING_REVIEW'}});
    return doc;
  }

  @Get(':userId/documents')
  async documents(@Param('userId') userId:string,@Req() req:any){ this.own(req,userId);
    const d=await this.prisma.driverProfile.findUnique({where:{userId}});
    if(!d) throw new NotFoundException('Driver profile not found');
    return this.prisma.driverDocument.findMany({where:{driverProfileId:d.id},orderBy:{createdAt:'desc'}});
  }

  @Get(':userId/compliance')
  async compliance(@Param('userId') userId:string,@Req() req:any){ this.own(req,userId);
    const d=await this.prisma.driverProfile.findUnique({where:{userId},include:{vehicles:true}});
    if(!d) throw new NotFoundException('Driver profile not found');
    const result=await this.complianceForDriver(d);
    if(result.expiredDocumentIds.length){
      await this.prisma.driverDocument.updateMany({where:{id:{in:result.expiredDocumentIds}},data:{status:'EXPIRED'}});
      if(d.availability!=='OFFLINE') await this.prisma.driverProfile.update({where:{id:d.id},data:{availability:'OFFLINE'}});
    }
    return {...result,driverStatus:d.status};
  }

  @Patch(':userId/availability')
  async availability(@Param('userId') userId: string, @Body() b: any, @Req() req:any) { this.own(req,userId);
    const d = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!d) throw new NotFoundException('Driver profile not found');
    if (!['OFFLINE','ONLINE'].includes(b.availability)) throw new BadRequestException('availability must be OFFLINE or ONLINE');
    if (b.availability === 'ONLINE' && d.status !== 'APPROVED') throw new BadRequestException('Driver must be approved before going ONLINE');
    if (b.availability === 'ONLINE') {
      const full=await this.prisma.driverProfile.findUnique({where:{id:d.id},include:{vehicles:true}});
      const compliance=await this.complianceForDriver(full);
      if(compliance.expiredDocumentIds.length) await this.prisma.driverDocument.updateMany({where:{id:{in:compliance.expiredDocumentIds}},data:{status:'EXPIRED'}});
      if(!compliance.eligibleToDrive) throw new BadRequestException('Required driver/vehicle documents are missing, unapproved or expired');
    }
    return this.prisma.driverProfile.update({ where: { id: d.id }, data: { availability: b.availability } });
  }

  @Patch(':userId/location')
  async location(@Param('userId') userId: string, @Body() b: any, @Req() req:any) { this.own(req,userId);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequestException('lat and lng are required');
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new BadRequestException('Invalid latitude or longitude');
    const d = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!d) throw new NotFoundException('Driver profile not found');

    const updated = await this.prisma.driverProfile.update({
      where: { id: d.id },
      data: { currentLat: lat, currentLng: lng, lastLocationAt: new Date() },
    });

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverProfileId: d.id,
        status: { in: ['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS'] },
      },
      orderBy: { acceptedAt: 'desc' },
    });

    if (activeTrip) {
      const heading = b.heading === undefined ? undefined : Number(b.heading);
      const speedMph = b.speedMph === undefined ? undefined : Number(b.speedMph);
      const accuracyMeters = b.accuracyMeters === undefined ? undefined : Number(b.accuracyMeters);
      await this.prisma.tripLocation.create({
        data: {
          tripId: activeTrip.id,
          driverProfileId: d.id,
          lat,
          lng,
          heading: Number.isFinite(heading) ? heading : undefined,
          speedMph: Number.isFinite(speedMph) ? speedMph : undefined,
          accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : undefined,
        },
      });

      // Foundation safety heuristics. They only create alerts; they never cancel or alter the trip.
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (activeTrip.status === 'IN_PROGRESS') {
        const deviationMiles = this.distanceFromRouteCorridorMiles(activeTrip, lat, lng);
        if (deviationMiles >= 1.5) {
          const recent = await this.prisma.safetyIncident.findFirst({ where: { tripId: activeTrip.id, type: 'ROUTE_DEVIATION', createdAt: { gte: tenMinutesAgo }, status: { in: ['OPEN','ACKNOWLEDGED'] } } });
          if (!recent) {
            const incident = await this.prisma.safetyIncident.create({ data: { tripId: activeTrip.id, reporterRole: 'SYSTEM', type: 'ROUTE_DEVIATION', priority: 'HIGH', lat, lng, metadata: { deviationMiles: Number(deviationMiles.toFixed(2)), heuristic: 'straight_route_corridor' } } });
            await this.prisma.tripEvent.create({ data: { tripId: activeTrip.id, type: 'ROUTE_DEVIATION_DETECTED', metadata: { incidentId: incident.id, deviationMiles: Number(deviationMiles.toFixed(2)) } } });
            this.realtime.publish(activeTrip.id, 'SAFETY_INCIDENT', { incidentId: incident.id, type: 'ROUTE_DEVIATION', lat, lng });
          }
        }

        if (Number.isFinite(speedMph) && (speedMph as number) < 1) {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          const movingSample = await this.prisma.tripLocation.findFirst({ where: { tripId: activeTrip.id, recordedAt: { gte: fiveMinutesAgo }, speedMph: { gt: 3 } }, orderBy: { recordedAt: 'desc' } });
          const oldestSlow = await this.prisma.tripLocation.findFirst({ where: { tripId: activeTrip.id, recordedAt: { gte: fiveMinutesAgo }, speedMph: { lt: 1 } }, orderBy: { recordedAt: 'asc' } });
          if (!movingSample && oldestSlow && Date.now() - oldestSlow.recordedAt.getTime() >= 4 * 60 * 1000) {
            const recent = await this.prisma.safetyIncident.findFirst({ where: { tripId: activeTrip.id, type: 'UNUSUAL_STOP', createdAt: { gte: tenMinutesAgo }, status: { in: ['OPEN','ACKNOWLEDGED'] } } });
            if (!recent) {
              const incident = await this.prisma.safetyIncident.create({ data: { tripId: activeTrip.id, reporterRole: 'SYSTEM', type: 'UNUSUAL_STOP', priority: 'MEDIUM', lat, lng, metadata: { stoppedApproxMinutes: 4 } } });
              await this.prisma.tripEvent.create({ data: { tripId: activeTrip.id, type: 'UNUSUAL_STOP_DETECTED', metadata: { incidentId: incident.id } } });
              this.realtime.publish(activeTrip.id, 'SAFETY_INCIDENT', { incidentId: incident.id, type: 'UNUSUAL_STOP', lat, lng });
            }
          }
        }
      }
      this.realtime.publish(activeTrip.id, 'DRIVER_LOCATION', { lat, lng, heading, speedMph, accuracyMeters });
    }

    return updated;
  }
}
