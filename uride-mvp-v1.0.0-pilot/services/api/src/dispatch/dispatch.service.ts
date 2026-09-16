import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private worker?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  onModuleInit(){
    if(String(process.env.ENABLE_DISPATCH_WORKER||'true').toLowerCase()==='false') return;
    const interval=Math.max(3000,Number(process.env.DISPATCH_WORKER_INTERVAL_MS||5000));
    this.worker=setInterval(()=>{ void this.processDriverOffers(); },interval);
  }

  onModuleDestroy(){ if(this.worker) clearInterval(this.worker); }

  async processDriverOffers(){
    const drivers=await this.prisma.driverProfile.findMany({
      where:{status:'APPROVED',availability:'ONLINE',currentLat:{not:null},currentLng:{not:null}},
      select:{userId:true},
      take:200,
    });
    let offered=0;
    for(const d of drivers){
      try{ const offer=await this.nextOffer(d.userId,20,20); if(offer) offered++; }catch{}
    }
    return {driversChecked:drivers.length,offered,processedAt:new Date()};
  }

  private milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
    const rad = (v: number) => (v * Math.PI) / 180;
    const earthRadiusMiles = 3958.7613;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
  }

  async candidates(tripId: string, radiusMiles = 12, limit = 10) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'SEARCHING') throw new BadRequestException('Trip is not searching for a driver');

    const drivers = await this.prisma.driverProfile.findMany({
      where: { status: 'APPROVED', availability: 'ONLINE', currentLat: { not: null }, currentLng: { not: null }, vehicles: { some: { status: 'APPROVED' } } },
      include: { user: { select: { id: true } }, vehicles: { where: { status: 'APPROVED' }, orderBy: { createdAt: 'asc' } } },
    });

    return drivers.map(driver => ({
      driverUserId: driver.user.id,
      driverProfileId: driver.id,
      vehicleId: driver.vehicles[0]?.id,
      distanceMiles: this.milesBetween(trip.pickupLat, trip.pickupLng, driver.currentLat as number, driver.currentLng as number),
      lastLocationAt: driver.lastLocationAt,
    })).filter(c => c.vehicleId && c.distanceMiles <= radiusMiles)
      .sort((a,b)=>a.distanceMiles-b.distanceMiles)
      .slice(0, Math.max(1, Math.min(limit,25)))
      .map(c=>({...c,distanceMiles:Number(c.distanceMiles.toFixed(2))}));
  }

  async nextOffer(driverUserId: string, radiusMiles = 20, ttlSeconds = 20) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId: driverUserId },
      include: { vehicles: { where: { status: 'APPROVED' }, orderBy: { createdAt: 'asc' } } },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (driver.status !== 'APPROVED' || driver.availability !== 'ONLINE') return null;
    if (driver.currentLat == null || driver.currentLng == null || !driver.vehicles[0]) return null;

    const now = new Date();

    // Activate scheduled rides when their dispatch window opens.
    const dueScheduled = await this.prisma.trip.findMany({
      where: { status: 'SCHEDULED', dispatchAfter: { lte: now }, scheduledFor: { gt: now } },
      select: { id: true },
      take: 50,
    });
    if (dueScheduled.length) {
      await this.prisma.trip.updateMany({
        where: { id: { in: dueScheduled.map(t => t.id) }, status: 'SCHEDULED' },
        data: { status: 'SEARCHING' },
      });
      for (const t of dueScheduled) {
        await this.prisma.tripEvent.create({ data: { tripId: t.id, type: 'SCHEDULED_DISPATCH_STARTED', metadata: { activatedAt: now } } });
      }
    }

    await this.prisma.tripOffer.updateMany({
      where: { driverProfileId: driver.id, status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED', respondedAt: now },
    });

    const existing = await this.prisma.tripOffer.findFirst({
      where: { driverProfileId: driver.id, status: 'PENDING', expiresAt: { gt: now }, trip: { status: 'SEARCHING' } },
      include: { trip: true }, orderBy: { offeredAt: 'asc' },
    });
    if (existing) {
      const rule=await this.prisma.pricingRule.findFirst({where:{serviceType:existing.trip.serviceType,isActive:true},orderBy:{updatedAt:'desc'}});
      const rate=Math.max(0,Math.min(0.60,Number(rule?.platformCommissionRate??process.env.URIDE_COMMISSION_RATE??0.20)));
      const gross=Number(existing.trip.estimatedFare);
      return {...existing,estimatedPlatformFee:Number((gross*rate).toFixed(2)),estimatedDriverEarnings:Number((gross*(1-rate)).toFixed(2)),commissionRate:rate};
    }

    const trips = await this.prisma.trip.findMany({ where: { status: 'SEARCHING', driverProfileId: null }, orderBy: { requestedAt: 'asc' }, take: 50 });
    const ranked = trips.map(trip => ({ trip, distanceMiles: this.milesBetween(trip.pickupLat,trip.pickupLng,driver.currentLat as number,driver.currentLng as number) }))
      .filter(x=>x.distanceMiles<=radiusMiles)
      .sort((a,b)=>{
        const aPreferred = a.trip.preferredDriverProfileId === driver.id ? 0 : 1;
        const bPreferred = b.trip.preferredDriverProfileId === driver.id ? 0 : 1;
        return aPreferred-bPreferred || a.distanceMiles-b.distanceMiles;
      });

    for (const item of ranked) {
      const prior = await this.prisma.tripOffer.findUnique({ where: { tripId_driverProfileId: { tripId: item.trip.id, driverProfileId: driver.id } } });
      if (prior) continue;
      const offer = await this.prisma.tripOffer.create({
        data: { tripId:item.trip.id, driverProfileId:driver.id, vehicleId:driver.vehicles[0].id, distanceMiles:Number(item.distanceMiles.toFixed(2)), expiresAt:new Date(Date.now()+Math.max(10,Math.min(ttlSeconds,60))*1000) },
        include: { trip: true },
      });
      const rule=await this.prisma.pricingRule.findFirst({where:{serviceType:offer.trip.serviceType,isActive:true},orderBy:{updatedAt:'desc'}});
      const rate=Math.max(0,Math.min(0.60,Number(rule?.platformCommissionRate??process.env.URIDE_COMMISSION_RATE??0.20)));
      const gross=Number(offer.trip.estimatedFare);
      const estimatedPlatformFee=Number((gross*rate).toFixed(2));
      const estimatedDriverEarnings=Number((gross-estimatedPlatformFee).toFixed(2));
      await this.prisma.tripEvent.create({ data: { tripId:item.trip.id, type:'DRIVER_OFFERED', actorUserId:driverUserId, metadata:{ offerId:offer.id, expiresAt:offer.expiresAt,estimatedDriverEarnings,commissionRate:rate } } });
      await this.notifications.sendToUser(driverUserId,'DRIVER_TRIP_OFFER','Nueva solicitud URide',`${Number(offer.distanceMiles).toFixed(1)} mi hasta el pasajero • ~$${estimatedDriverEarnings.toFixed(2)} para ti`,{tripId:offer.tripId,offerId:offer.id,expiresAt:offer.expiresAt,estimatedDriverEarnings});
      return {...offer,estimatedPlatformFee,estimatedDriverEarnings,commissionRate:rate};
    }
    return null;
  }

  async rejectOffer(offerId: string, driverUserId: string) {
    const offer = await this.prisma.tripOffer.findUnique({ where:{id:offerId}, include:{driverProfile:{include:{user:true}}} });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.driverProfile.user.id !== driverUserId) throw new BadRequestException('Offer does not belong to this driver');
    if (offer.status !== 'PENDING') return offer;
    const updated = await this.prisma.tripOffer.update({ where:{id:offerId}, data:{status:'REJECTED',respondedAt:new Date()} });
    await this.prisma.tripEvent.create({ data:{tripId:offer.tripId,type:'DRIVER_REJECTED',actorUserId:driverUserId,metadata:{offerId}} });
    return updated;
  }
}
