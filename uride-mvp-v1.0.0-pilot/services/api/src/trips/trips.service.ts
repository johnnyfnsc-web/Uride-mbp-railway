import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RiskService } from '../risk/risk.service';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
    private risk: RiskService,
  ) {}

  async create(dto: any) {
    const passenger = await this.prisma.user.findUnique({ where: { id: dto.passengerUserId } });
    if (!passenger || passenger.role !== 'PASSENGER') throw new BadRequestException('Valid passengerUserId is required');
    await this.risk.assertTripRequestAllowed(dto.passengerUserId);
    for (const k of ['pickupAddress','pickupLat','pickupLng','destinationAddress','destinationLat','destinationLng','estimatedMiles','estimatedMinutes']) {
      if (dto[k] === undefined || dto[k] === null || dto[k] === '') throw new BadRequestException(`${k} is required`);
    }
    const q = await this.pricing.quote(dto);
    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    if (scheduledFor && (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now() + 10 * 60 * 1000)) {
      throw new BadRequestException('Scheduled rides must be at least 10 minutes in the future');
    }
    let preferredDriverProfileId: string | null = dto.preferredDriverProfileId || null;
    if (preferredDriverProfileId) {
      const favorite = await this.prisma.favoriteDriver.findUnique({
        where: { passengerUserId_driverProfileId: { passengerUserId: dto.passengerUserId, driverProfileId: preferredDriverProfileId } },
      });
      if (!favorite) throw new BadRequestException('Preferred driver must be saved as a favorite');
    }
    const trip = await this.prisma.trip.create({
      data: {
        passengerUserId: dto.passengerUserId,
        serviceType: q.serviceType,
        status: scheduledFor ? 'SCHEDULED' : 'SEARCHING',
        scheduledFor,
        dispatchAfter: scheduledFor ? new Date(scheduledFor.getTime() - 30 * 60 * 1000) : null,
        preferredDriverProfileId,
        pickupAddress: dto.pickupAddress,
        pickupLat: Number(dto.pickupLat),
        pickupLng: Number(dto.pickupLng),
        destinationAddress: dto.destinationAddress,
        destinationLat: Number(dto.destinationLat),
        destinationLng: Number(dto.destinationLng),
        estimatedMiles: q.estimatedMiles,
        estimatedMinutes: q.estimatedMinutes,
        estimatedFare: q.estimatedFare,
        events: { create: { type: scheduledFor ? 'TRIP_SCHEDULED' : 'TRIP_REQUESTED', actorUserId: dto.passengerUserId, metadata: { quote: q, scheduledFor, preferredDriverProfileId } } },
      },
      include: { events: true },
    });
    this.realtime.publish(trip.id, scheduledFor ? 'TRIP_SCHEDULED' : 'TRIP_SEARCHING', { status: trip.status, scheduledFor });
    return trip;
  }

  async get(id: string) {
    const t = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        driver: { include: { user: { select: { id: true, email: true, phone: true } } } },
        vehicle: true,
        events: { orderBy: { createdAt: 'asc' } },
        locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
        payments: { include: { receipt: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!t) throw new NotFoundException('Trip not found');
    return t;
  }

  async accept(id: string, driverUserId: string, vehicleId?: string, offerId?: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId: driverUserId }, include: { vehicles: true } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    if (driver.status !== 'APPROVED') throw new BadRequestException('Driver is not approved');
    if (driver.availability !== 'ONLINE') throw new BadRequestException('Driver must be ONLINE');
    const vehicle = vehicleId ? driver.vehicles.find(v => v.id === vehicleId) : driver.vehicles.find(v => v.status === 'APPROVED');
    if (!vehicle || vehicle.status !== 'APPROVED') throw new BadRequestException('An approved driver vehicle is required');
    if (offerId) {
      const offer = await this.prisma.tripOffer.findUnique({ where: { id: offerId } });
      if (!offer || offer.tripId !== id || offer.driverProfileId !== driver.id) throw new BadRequestException('Invalid trip offer');
      if (offer.status !== 'PENDING' || offer.expiresAt <= new Date()) throw new ConflictException('Trip offer expired or is no longer available');
    }

    const result = await this.prisma.$transaction(async tx => {
      const claimed = await tx.trip.updateMany({
        where: { id, status: 'SEARCHING', driverProfileId: null },
        data: { driverProfileId: driver.id, vehicleId: vehicle.id, status: 'DRIVER_ASSIGNED', acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('Trip is no longer available');
      await tx.driverProfile.update({ where: { id: driver.id }, data: { availability: 'ON_TRIP' } });
      if (offerId) await tx.tripOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      await tx.tripOffer.updateMany({ where: { tripId: id, status: 'PENDING', ...(offerId ? { id: { not: offerId } } : {}) }, data: { status: 'CANCELLED', respondedAt: new Date() } });
      await tx.tripEvent.create({ data: { tripId: id, type: 'DRIVER_ACCEPTED', actorUserId: driverUserId, metadata: { vehicleId: vehicle.id, offerId: offerId || null } } });
      return tx.trip.findUnique({ where: { id }, include: { driver: true, vehicle: true, events: true } });
    });
    this.realtime.publish(id, 'DRIVER_ACCEPTED', { driverUserId, vehicleId: vehicle.id, status: 'DRIVER_ASSIGNED' });
    const passengerId=(result as any)?.passengerUserId;
    if(passengerId) await this.notifications.sendToUser(passengerId,'DRIVER_ASSIGNED','Conductor asignado','Tu conductor aceptó el viaje y va en camino.',{tripId:id,status:'DRIVER_ASSIGNED'});
    return result;
  }

  async transition(id: string, type: 'arriving'|'arrived'|'start'|'complete', actorUserId?: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Trip not found');
    const map: any = {
      arriving: { from: 'DRIVER_ASSIGNED', to: 'DRIVER_ARRIVING', event: 'DRIVER_ARRIVING' },
      arrived: { from: 'DRIVER_ARRIVING', to: 'DRIVER_ARRIVED', event: 'DRIVER_ARRIVED' },
      start: { from: 'DRIVER_ARRIVED', to: 'IN_PROGRESS', event: 'TRIP_STARTED' },
      complete: { from: 'IN_PROGRESS', to: 'COMPLETED', event: 'TRIP_COMPLETED' },
    };
    const cfg = map[type];
    if (trip.status !== cfg.from) throw new ConflictException(`Trip must be ${cfg.from} before ${cfg.to}`);
    const updated = await this.prisma.$transaction(async tx => {
      const data: any = { status: cfg.to };
      if (type === 'arrived') { data.driverArrivedAt = new Date(); data.waitStartedAt = new Date(); }
      if (type === 'start') data.startedAt = new Date();
      if (type === 'complete') { data.completedAt = new Date(); data.finalFare = trip.estimatedFare; }
      const changed = await tx.trip.update({ where: { id }, data });
      await tx.tripEvent.create({ data: { tripId: id, type: cfg.event, actorUserId } });
      if (type === 'complete' && trip.driverProfileId) {
        await tx.driverProfile.update({ where: { id: trip.driverProfileId }, data: { availability: 'ONLINE' } });
      }
      return changed;
    });
    this.realtime.publish(id, cfg.event, { status: cfg.to, actorUserId });
    const passengerPush:any={
      arriving:['DRIVER_ARRIVING','Tu conductor va en camino','El conductor se dirige al punto de recogida.'],
      arrived:['DRIVER_ARRIVED','Tu conductor llegó','Tu conductor está en el punto de recogida.'],
      start:['TRIP_STARTED','Viaje iniciado','Tu viaje URide ha comenzado.'],
      complete:['TRIP_COMPLETED','Viaje completado','Llegaste a tu destino. Ya puedes ver tu recibo y calificar.'],
    };
    const push=passengerPush[type];
    if(push) await this.notifications.sendToUser(trip.passengerUserId,push[0],push[1],push[2],{tripId:id,status:cfg.to});
    return updated;
  }

  private cancellationFeeFor(trip: any, actor: 'PASSENGER'|'DRIVER'|'SYSTEM') {
    // MVP policy is configurable later. Passenger cancellation after driver assignment:
    // $5.00; before assignment: free. Driver/system cancellation: waived.
    if (actor !== 'PASSENGER') return 0;
    const chargeable = ['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED'].includes(trip.status);
    return chargeable ? 5 : 0;
  }

  async cancel(id: string, dto: any) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (['COMPLETED','CANCELLED','NO_SHOW'].includes(trip.status)) {
      throw new ConflictException('Trip can no longer be cancelled');
    }
    const actor = String(dto.actor || 'PASSENGER').toUpperCase();
    if (!['PASSENGER','DRIVER','SYSTEM'].includes(actor)) throw new BadRequestException('Invalid cancellation actor');
    const fee = this.cancellationFeeFor(trip, actor as any);
    const updated = await this.prisma.$transaction(async tx => {
      const changed = await tx.trip.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationActor: actor as any,
          cancellationReason: dto.reason || 'OTHER',
          cancellationNote: dto.note || null,
          cancellationFee: fee,
          cancellationFeeStatus: fee > 0 ? 'PENDING' : 'WAIVED',
        },
      });
      await tx.tripOffer.updateMany({ where: { tripId: id, status: 'PENDING' }, data: { status: 'CANCELLED', respondedAt: new Date() } });
      await tx.tripEvent.create({ data: { tripId: id, type: 'TRIP_CANCELLED', actorUserId: dto.actorUserId || null, metadata: { actor, reason: dto.reason || 'OTHER', fee } } });
      if (trip.driverProfileId) await tx.driverProfile.update({ where: { id: trip.driverProfileId }, data: { availability: 'ONLINE' } });
      return changed;
    });
    this.realtime.publish(id, 'TRIP_CANCELLED', { status: 'CANCELLED', actor, fee });
    if(actor==='PASSENGER') await this.risk.evaluateCancellationPattern(trip.passengerUserId);
    if(actor==='DRIVER') await this.notifications.sendToUser(trip.passengerUserId,'TRIP_CANCELLED','Viaje cancelado','El conductor canceló el viaje. URide actualizará el estado de tu solicitud.',{tripId:id,actor});
    if(actor==='PASSENGER' && trip.driverProfileId){
      const d=await this.prisma.driverProfile.findUnique({where:{id:trip.driverProfileId},select:{userId:true}});
      if(d) await this.notifications.sendToUser(d.userId,'TRIP_CANCELLED','Viaje cancelado','El pasajero canceló el viaje.',{tripId:id,actor});
    }
    return updated;
  }

  async waitStatus(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'DRIVER_ARRIVED' || !trip.waitStartedAt) return { active: false, elapsedSeconds: 0, freeWaitSeconds: 300, noShowEligible: false };
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - trip.waitStartedAt.getTime()) / 1000));
    return { active: true, elapsedSeconds, freeWaitSeconds: 300, noShowEligible: elapsedSeconds >= 300 };
  }

  async noShow(id: string, dto: any) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'DRIVER_ARRIVED' || !trip.waitStartedAt) throw new ConflictException('Driver must be arrived before no-show');
    const elapsed = Date.now() - trip.waitStartedAt.getTime();
    if (elapsed < 5 * 60 * 1000) throw new ConflictException('No-show is available after 5 minutes of waiting');
    const fee = 5;
    const updated = await this.prisma.$transaction(async tx => {
      const changed = await tx.trip.update({
        where: { id },
        data: { status: 'NO_SHOW', noShowAt: new Date(), cancellationFee: fee, cancellationFeeStatus: 'PENDING' },
      });
      await tx.tripEvent.create({ data: { tripId: id, type: 'PASSENGER_NO_SHOW', actorUserId: dto.actorUserId || null, metadata: { fee, waitedSeconds: Math.floor(elapsed/1000) } } });
      if (trip.driverProfileId) await tx.driverProfile.update({ where: { id: trip.driverProfileId }, data: { availability: 'ONLINE' } });
      return changed;
    });
    this.realtime.publish(id, 'PASSENGER_NO_SHOW', { status: 'NO_SHOW', fee });
    return updated;
  }


  async rateTrip(id: string, dto: any) {
    const trip = await this.prisma.trip.findUnique({ where: { id }, include: { driver: true } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'COMPLETED') throw new ConflictException('Trip must be completed before rating');
    const stars = Number(dto.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new BadRequestException('Rating must be from 1 to 5 stars');
    const fromUserId = dto.fromUserId;
    let toUserId: string;
    let role: any;
    if (fromUserId === trip.passengerUserId) {
      if (!trip.driver?.userId) throw new BadRequestException('Trip has no driver');
      toUserId = trip.driver.userId; role = 'PASSENGER_TO_DRIVER';
    } else if (trip.driver?.userId === fromUserId) {
      toUserId = trip.passengerUserId; role = 'DRIVER_TO_PASSENGER';
    } else throw new BadRequestException('User did not participate in this trip');
    const rating = await this.prisma.rating.upsert({
      where: { tripId_fromUserId: { tripId: id, fromUserId } },
      update: { stars, comment: dto.comment || null },
      create: { tripId: id, fromUserId, toUserId, role, stars, comment: dto.comment || null },
    });
    await this.prisma.tripEvent.create({ data: { tripId: id, type: 'TRIP_RATED', actorUserId: fromUserId, metadata: { role, stars } } });
    return rating;
  }

  async favoriteDriver(id: string, passengerUserId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.passengerUserId !== passengerUserId || !trip.driverProfileId) throw new BadRequestException('Passenger/driver mismatch');
    return this.prisma.favoriteDriver.upsert({
      where: { passengerUserId_driverProfileId: { passengerUserId, driverProfileId: trip.driverProfileId } },
      update: {},
      create: { passengerUserId, driverProfileId: trip.driverProfileId },
    });
  }

  async createReturnTrip(id: string, dto: any) {
    const original = await this.prisma.trip.findUnique({ where: { id } });
    if (!original) throw new NotFoundException('Trip not found');
    if (original.status !== 'COMPLETED' || !original.driverProfileId) throw new ConflictException('Original trip must be completed with a driver');
    if (dto.passengerUserId !== original.passengerUserId) throw new BadRequestException('Passenger mismatch');
    const q = await this.pricing.quote({ serviceType: original.serviceType, estimatedMiles: original.estimatedMiles, estimatedMinutes: original.estimatedMinutes });
    const trip = await this.prisma.trip.create({
      data: {
        passengerUserId: original.passengerUserId,
        preferredDriverProfileId: original.driverProfileId,
        returnOfTripId: original.id,
        serviceType: original.serviceType,
        status: 'SEARCHING',
        pickupAddress: original.destinationAddress,
        pickupLat: original.destinationLat,
        pickupLng: original.destinationLng,
        destinationAddress: original.pickupAddress,
        destinationLat: original.pickupLat,
        destinationLng: original.pickupLng,
        estimatedMiles: q.estimatedMiles,
        estimatedMinutes: q.estimatedMinutes,
        estimatedFare: q.estimatedFare,
        events: { create: { type: 'RETURN_TRIP_REQUESTED', actorUserId: original.passengerUserId, metadata: { originalTripId: original.id, preferredDriverProfileId: original.driverProfileId } } },
      },
    });
    this.realtime.publish(trip.id, 'TRIP_SEARCHING', { status: trip.status, preferredDriverProfileId: original.driverProfileId });
    return trip;
  }


  async listFavorites(passengerUserId: string) {
    return this.prisma.favoriteDriver.findMany({
      where: { passengerUserId },
      include: { driverProfile: { include: { user: { select: { id: true, email: true } }, vehicles: { where: { status: 'APPROVED' } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upcoming(passengerUserId: string) {
    return this.prisma.trip.findMany({
      where: { passengerUserId, status: 'SCHEDULED', scheduledFor: { gt: new Date() } },
      include: { preferredDriver: true },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  async dueReminders(passengerUserId: string) {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    const trips = await this.prisma.trip.findMany({
      where: { passengerUserId, status: 'SCHEDULED', scheduledFor: { gt: now, lte: in24h } },
      orderBy: { scheduledFor: 'asc' },
    });
    const reminders: any[] = [];
    for (const trip of trips) {
      const ms = (trip.scheduledFor as Date).getTime() - now.getTime();
      if (ms <= 60 * 60 * 1000 && !trip.reminder1hSentAt) {
        const message='Tu URide programado sale aproximadamente en 1 hora.';
        reminders.push({ tripId: trip.id, type: 'ONE_HOUR', scheduledFor: trip.scheduledFor, message });
        await this.notifications.sendToUser(passengerUserId,'SCHEDULED_RIDE_1H','Tu viaje URide es pronto',message,{tripId:trip.id,scheduledFor:trip.scheduledFor});
        await this.prisma.trip.update({ where: { id: trip.id }, data: { reminder1hSentAt: now } });
      } else if (ms <= 24 * 60 * 60 * 1000 && !trip.reminder24hSentAt) {
        const message='Tienes un URide programado dentro de las próximas 24 horas.';
        reminders.push({ tripId: trip.id, type: 'TWENTY_FOUR_HOUR', scheduledFor: trip.scheduledFor, message });
        await this.notifications.sendToUser(passengerUserId,'SCHEDULED_RIDE_24H','Recordatorio de viaje URide',message,{tripId:trip.id,scheduledFor:trip.scheduledFor});
        await this.prisma.trip.update({ where: { id: trip.id }, data: { reminder24hSentAt: now } });
      }
    }
    return reminders;
  }

  async scheduleReturnTrip(id: string, dto: any) {
    const original = await this.prisma.trip.findUnique({ where: { id } });
    if (!original) throw new NotFoundException('Trip not found');
    if (original.status !== 'COMPLETED' || !original.driverProfileId) throw new ConflictException('Original trip must be completed with a driver');
    if (dto.passengerUserId !== original.passengerUserId) throw new BadRequestException('Passenger mismatch');
    const scheduledFor = new Date(dto.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now() + 10 * 60 * 1000) throw new BadRequestException('Return time must be at least 10 minutes in the future');
    const q = await this.pricing.quote({ serviceType: original.serviceType, estimatedMiles: original.estimatedMiles, estimatedMinutes: original.estimatedMinutes });
    const trip = await this.prisma.trip.create({
      data: {
        passengerUserId: original.passengerUserId,
        preferredDriverProfileId: original.driverProfileId,
        returnOfTripId: original.id,
        serviceType: original.serviceType,
        status: 'SCHEDULED',
        scheduledFor,
        dispatchAfter: new Date(scheduledFor.getTime() - 30 * 60 * 1000),
        pickupAddress: original.destinationAddress,
        pickupLat: original.destinationLat,
        pickupLng: original.destinationLng,
        destinationAddress: original.pickupAddress,
        destinationLat: original.pickupLat,
        destinationLng: original.pickupLng,
        estimatedMiles: q.estimatedMiles,
        estimatedMinutes: q.estimatedMinutes,
        estimatedFare: q.estimatedFare,
        events: { create: { type: 'RETURN_TRIP_SCHEDULED', actorUserId: original.passengerUserId, metadata: { originalTripId: original.id, scheduledFor, preferredDriverProfileId: original.driverProfileId } } },
      },
    });
    return trip;
  }

  async changeDestination(id:string,passengerUserId:string,dto:any){
    const trip=await this.prisma.trip.findUnique({where:{id}});
    if(!trip) throw new NotFoundException('Trip not found');
    if(trip.passengerUserId!==passengerUserId) throw new BadRequestException('Passenger mismatch');
    if(!['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS'].includes(trip.status)) throw new ConflictException('Destination can only be changed after assignment and before completion');
    for(const k of ['destinationAddress','destinationLat','destinationLng','estimatedMiles','estimatedMinutes']){
      if(dto[k]===undefined||dto[k]===null||dto[k]==='') throw new BadRequestException(`${k} is required`);
    }
    const q=await this.pricing.quote({serviceType:trip.serviceType,estimatedMiles:Number(dto.estimatedMiles),estimatedMinutes:Number(dto.estimatedMinutes)});
    const updated=await this.prisma.$transaction(async tx=>{
      const changed=await tx.trip.update({where:{id},data:{
        destinationAddress:dto.destinationAddress,
        destinationLat:Number(dto.destinationLat),
        destinationLng:Number(dto.destinationLng),
        estimatedMiles:q.estimatedMiles,
        estimatedMinutes:q.estimatedMinutes,
        estimatedFare:q.estimatedFare,
      }});
      await tx.tripEvent.create({data:{tripId:id,type:'DESTINATION_CHANGED',actorUserId:passengerUserId,metadata:{
        previous:{address:trip.destinationAddress,lat:trip.destinationLat,lng:trip.destinationLng,estimatedFare:Number(trip.estimatedFare)},
        next:{address:dto.destinationAddress,lat:Number(dto.destinationLat),lng:Number(dto.destinationLng),estimatedFare:q.estimatedFare},
      }}});
      return changed;
    });
    if(trip.driverProfileId){
      const d=await this.prisma.driverProfile.findUnique({where:{id:trip.driverProfileId},select:{userId:true}});
      if(d) await this.notifications.sendToUser(d.userId,'DESTINATION_CHANGED','Destino actualizado','El pasajero cambió el destino. Abre URide para ver la nueva ruta.',{tripId:id,destinationAddress:dto.destinationAddress});
    }
    this.realtime.publish(id,'DESTINATION_CHANGED',{destinationAddress:dto.destinationAddress,destinationLat:Number(dto.destinationLat),destinationLng:Number(dto.destinationLng),estimatedFare:q.estimatedFare});
    return updated;
  }


}
