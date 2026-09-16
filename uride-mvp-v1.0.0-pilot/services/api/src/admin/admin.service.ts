import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { EarningsService } from '../earnings/earnings.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AdminService {
  constructor(private prisma:PrismaService, private notifications:NotificationsService, private payments:PaymentsService, private earnings:EarningsService, private ai:AiService){}

  private async log(action:string,entityType:string,entityId:string|undefined,body:any){
    return this.prisma.adminAuditLog.create({
      data:{adminUserId:body?.adminUserId||null,action,entityType,entityId:entityId||null,metadata:body||undefined},
    });
  }

  async dashboard(){
    const activeStatuses:any[]=['SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS'];
    const [activeTrips,onlineDrivers,pendingDrivers,pendingVehicles,pendingDocuments,expiringDocuments,openTickets,openIncidents,criticalIncidents,unacknowledgedIncidents,openRiskCases,availableDriverEarnings,pendingRefunds,scheduledTrips]=await Promise.all([
      this.prisma.trip.count({where:{status:{in:activeStatuses}}}),
      this.prisma.driverProfile.count({where:{availability:{in:['ONLINE','ON_TRIP']}}}),
      this.prisma.driverProfile.count({where:{status:'PENDING_REVIEW'}}),
      this.prisma.vehicle.count({where:{status:'PENDING_REVIEW'}}),
      this.prisma.driverDocument.count({where:{status:'PENDING_REVIEW'}}),
      this.prisma.driverDocument.count({where:{status:'APPROVED',expiresAt:{gt:new Date(),lte:new Date(Date.now()+30*24*60*60*1000)}}}),
      this.prisma.supportTicket.count({where:{status:{in:['OPEN','IN_PROGRESS','WAITING_USER']}}}),
      this.prisma.safetyIncident.count({where:{status:{in:['OPEN','ACKNOWLEDGED']}}}),
      this.prisma.safetyIncident.count({where:{status:{in:['OPEN','ACKNOWLEDGED']},priority:'CRITICAL'}}),
      this.prisma.safetyIncident.count({where:{status:'OPEN',acknowledgedAt:null}}),
      this.prisma.riskCase.count({where:{status:{in:['OPEN','REVIEWING','RESTRICTED']}}}),
      this.prisma.driverLedgerEntry.aggregate({where:{status:'AVAILABLE'},_sum:{amount:true}}),
      this.prisma.refundRequest.count({where:{status:{in:['REQUESTED','UNDER_REVIEW','APPROVED']}}}),
      this.prisma.trip.count({where:{status:'SCHEDULED',scheduledFor:{gt:new Date()}}}),
    ]);
    const oldestOpen=await this.prisma.safetyIncident.findFirst({where:{status:'OPEN'},orderBy:{createdAt:'asc'},select:{createdAt:true}});
    const oldestOpenMinutes=oldestOpen?Math.max(0,Math.floor((Date.now()-oldestOpen.createdAt.getTime())/60000)):0;
    return {activeTrips,onlineDrivers,pendingDrivers,pendingVehicles,pendingDocuments,expiringDocuments,openTickets,openIncidents,criticalIncidents,unacknowledgedIncidents,oldestOpenMinutes,openRiskCases,availableDriverEarnings:Number(availableDriverEarnings._sum.amount||0),pendingRefunds,scheduledTrips,generatedAt:new Date()};
  }

  pendingDrivers(){
    return this.prisma.driverProfile.findMany({
      where:{status:{in:['DRAFT','PENDING_REVIEW']}},
      include:{user:{select:{id:true,email:true,phone:true}},vehicles:true,documents:true},
      orderBy:{id:'asc'},
    });
  }

  async setDriverStatus(id:string,b:any){
    const allowed=['PENDING_REVIEW','APPROVED','SUSPENDED','REJECTED'];
    if(!allowed.includes(b.status)) throw new BadRequestException('Invalid driver status');
    const existing=await this.prisma.driverProfile.findUnique({where:{id},include:{vehicles:true,documents:true}});
    if(!existing) throw new NotFoundException('Driver not found');
    if(b.status==='APPROVED'){
      const now=new Date();
      const license=existing.documents.find((d:any)=>d.type==='DRIVER_LICENSE'&&d.status==='APPROVED'&&(!d.expiresAt||d.expiresAt>now));
      const eligibleVehicle=existing.vehicles.filter((v:any)=>v.status==='APPROVED').some((v:any)=>{
        const registration=existing.documents.find((d:any)=>d.vehicleId===v.id&&d.type==='VEHICLE_REGISTRATION'&&d.status==='APPROVED'&&(!d.expiresAt||d.expiresAt>now));
        const insurance=existing.documents.find((d:any)=>d.vehicleId===v.id&&d.type==='VEHICLE_INSURANCE'&&d.status==='APPROVED'&&(!d.expiresAt||d.expiresAt>now));
        return !!registration&&!!insurance;
      });
      if(!license||!eligibleVehicle) throw new BadRequestException('Driver requires approved valid license and at least one approved vehicle with valid registration and insurance');
    }
    const updated=await this.prisma.driverProfile.update({where:{id},data:{status:b.status,availability:b.status==='APPROVED'?existing.availability:'OFFLINE'}});
    await this.log('DRIVER_STATUS_CHANGED','DriverProfile',id,b);
    return updated;
  }

  async setVehicleStatus(id:string,b:any){
    const allowed=['PENDING_REVIEW','APPROVED','SUSPENDED','REJECTED'];
    if(!allowed.includes(b.status)) throw new BadRequestException('Invalid vehicle status');
    const existing=await this.prisma.vehicle.findUnique({where:{id}});
    if(!existing) throw new NotFoundException('Vehicle not found');
    const updated=await this.prisma.vehicle.update({where:{id},data:{status:b.status}});
    await this.log('VEHICLE_STATUS_CHANGED','Vehicle',id,b);
    return updated;
  }

  pendingDocuments(){
    return this.prisma.driverDocument.findMany({
      where:{status:'PENDING_REVIEW'},
      include:{driverProfile:{include:{user:{select:{id:true,email:true}},vehicles:true}},vehicle:true},
      orderBy:{createdAt:'asc'},
      take:200,
    });
  }

  async setDocumentStatus(id:string,b:any){
    const allowed=['APPROVED','REJECTED','PENDING_REVIEW'];
    if(!allowed.includes(b.status)) throw new BadRequestException('Invalid document status');
    const doc=await this.prisma.driverDocument.findUnique({where:{id},include:{driverProfile:true}});
    if(!doc) throw new NotFoundException('Driver document not found');
    const expiresAt=doc.expiresAt;
    if(b.status==='APPROVED' && expiresAt && expiresAt<=new Date()) throw new BadRequestException('Expired document cannot be approved');
    const updated=await this.prisma.driverDocument.update({where:{id},data:{
      status:b.status,
      reviewedAt:new Date(),
      reviewedByAdminUserId:b.adminUserId||null,
      rejectionReason:b.status==='REJECTED'?(b.rejectionReason||'Correction required'):null,
    }});
    if(b.status!=='APPROVED' && doc.driverProfile.availability!=='OFFLINE'){
      await this.prisma.driverProfile.update({where:{id:doc.driverProfileId},data:{availability:'OFFLINE'}});
    }
    await this.log('DRIVER_DOCUMENT_STATUS_CHANGED','DriverDocument',id,b);
    await this.notifications.sendToUser(doc.driverProfile.userId,'DRIVER_DOCUMENT_REVIEW',b.status==='APPROVED'?'Documento aprobado':'Documento necesita corrección',b.status==='APPROVED'?`${doc.type} fue aprobado.`:`${doc.type} necesita corrección antes de poder usarse.`,{documentId:id,status:b.status,rejectionReason:b.rejectionReason||null});
    return updated;
  }

  activeTrips(){
    return this.prisma.trip.findMany({
      where:{status:{in:['SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS']}},
      include:{passenger:{select:{id:true,email:true,phone:true}},driver:true,vehicle:true,locations:{orderBy:{recordedAt:'desc'},take:1}},
      orderBy:{requestedAt:'desc'},
      take:100,
    });
  }

  supportTickets(status?:string){
    return this.prisma.supportTicket.findMany({
      where:status?{status:status as any}:{status:{in:['OPEN','IN_PROGRESS','WAITING_USER']}},
      include:{requester:{select:{id:true,email:true,phone:true}},trip:true,messages:{orderBy:{createdAt:'desc'},take:1}},
      orderBy:[{priority:'desc'},{createdAt:'asc'}],
      take:100,
    });
  }

  async updateTicket(id:string,b:any){
    const t=await this.prisma.supportTicket.findUnique({where:{id}});
    if(!t) throw new NotFoundException('Ticket not found');
    const allowed=['OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED'];
    if(b.status && !allowed.includes(b.status)) throw new BadRequestException('Invalid ticket status');
    const updated=await this.prisma.supportTicket.update({where:{id},data:{
      status:b.status||undefined,
      assignedAgentUserId:b.assignedAgentUserId||undefined,
      resolvedAt:b.status==='RESOLVED'?new Date():undefined,
    }});
    if(b.message?.trim()) await this.prisma.supportMessage.create({data:{ticketId:id,senderUserId:b.adminUserId||null,senderRole:'AGENT',message:b.message.trim()}});
    await this.log('SUPPORT_TICKET_UPDATED','SupportTicket',id,b);
    await this.notifications.sendToUser(t.requesterUserId,'SUPPORT_TICKET_UPDATED','Actualización de soporte',`Tu caso está ahora en estado ${updated.status}.`,{ticketId:id,status:updated.status});
    return updated;
  }

  safetyIncidents(status?:string){
    return this.prisma.safetyIncident.findMany({
      where:status?{status:status as any}:{status:{in:['OPEN','ACKNOWLEDGED']}},
      include:{trip:{include:{passenger:{select:{id:true,email:true,phone:true}},driver:{include:{user:{select:{id:true,email:true,phone:true}}}},vehicle:true,locations:{orderBy:{recordedAt:'desc'},take:5}}},reporter:{select:{id:true,email:true,phone:true}},actions:{orderBy:{createdAt:'asc'}}},
      orderBy:[{priority:'desc'},{createdAt:'desc'}],
      take:100,
    });
  }

  async updateIncident(id:string,b:any){
    const incident=await this.prisma.safetyIncident.findUnique({where:{id},include:{trip:{include:{driver:true}}}});
    if(!incident) throw new NotFoundException('Safety incident not found');
    const allowed=['OPEN','ACKNOWLEDGED','RESOLVED'];
    if(!allowed.includes(b.status)) throw new BadRequestException('Invalid incident status');
    const updated=await this.prisma.safetyIncident.update({where:{id},data:{
      status:b.status,
      assignedAdminUserId:b.adminUserId||incident.assignedAdminUserId,
      acknowledgedAt:b.status==='ACKNOWLEDGED'&&!incident.acknowledgedAt?new Date():undefined,
      resolvedAt:b.status==='RESOLVED'?new Date():undefined,
      operatorResolution:b.status==='RESOLVED'?(b.operatorResolution||incident.operatorResolution):undefined,
    }});
    const actionType=b.status==='ACKNOWLEDGED'?'ACKNOWLEDGED':b.status==='RESOLVED'?'RESOLVED':'REOPENED';
    await this.prisma.safetyAction.create({data:{incidentId:id,adminUserId:b.adminUserId||null,type:actionType as any,note:b.operatorResolution||b.note||null}});
    await this.prisma.tripEvent.create({data:{tripId:incident.tripId,type:`SAFETY_${actionType}`,actorUserId:b.adminUserId||null,metadata:{incidentId:id}}});
    await this.log('SAFETY_INCIDENT_UPDATED','SafetyIncident',id,b);
    const users=[incident.trip.passengerUserId,incident.trip.driver?.userId].filter(Boolean) as string[];
    for(const userId of new Set(users)){
      await this.notifications.sendToUser(userId,'SAFETY_CASE_UPDATED','Actualización de Seguridad URide',b.status==='ACKNOWLEDGED'?'Un operador de URide está revisando la alerta de seguridad.':b.status==='RESOLVED'?'La alerta de seguridad fue marcada como resuelta por Operations.':'La alerta de seguridad volvió a estado abierto.',{tripId:incident.tripId,incidentId:id,status:b.status});
    }
    return updated;
  }

  async safetyMonitor(tripId:string){
    const trip=await this.prisma.trip.findUnique({
      where:{id:tripId},
      include:{
        passenger:{select:{id:true,email:true,phone:true,trustedContacts:true}},
        driver:{include:{user:{select:{id:true,email:true,phone:true,trustedContacts:true}}}},
        vehicle:true,
        locations:{orderBy:{recordedAt:'desc'},take:30},
        safetyIncidents:{include:{actions:{orderBy:{createdAt:'asc'}}},orderBy:{createdAt:'desc'}},
        events:{where:{type:{contains:'SAFETY'}},orderBy:{createdAt:'desc'},take:30},
      },
    });
    if(!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  async safetyAction(id:string,b:any){
    const incident=await this.prisma.safetyIncident.findUnique({where:{id},include:{trip:{include:{driver:true}}}});
    if(!incident) throw new NotFoundException('Safety incident not found');
    const allowed=['NOTE_ADDED','ESCALATED','TRUSTED_CONTACT_NOTIFIED','EMERGENCY_SERVICES_CONTACTED'];
    if(!allowed.includes(b.action)) throw new BadRequestException('Invalid safety action');
    const now=new Date();
    const data:any={assignedAdminUserId:b.adminUserId||incident.assignedAdminUserId};
    if(b.action==='ESCALATED'){
      data.escalationLevel=Math.min(3,incident.escalationLevel+1);
      data.escalatedAt=now;
      data.priority=incident.priority==='LOW'?'MEDIUM':incident.priority==='MEDIUM'?'HIGH':'CRITICAL';
    }
    if(b.action==='TRUSTED_CONTACT_NOTIFIED') data.trustedContactNotifiedAt=now;
    if(b.action==='EMERGENCY_SERVICES_CONTACTED') data.emergencyServicesContactedAt=now;
    const updated=await this.prisma.safetyIncident.update({where:{id},data});
    await this.prisma.safetyAction.create({data:{incidentId:id,adminUserId:b.adminUserId||null,type:b.action,note:b.note||null,metadata:b.metadata||undefined}});
    await this.prisma.tripEvent.create({data:{tripId:incident.tripId,type:`SAFETY_${b.action}`,actorUserId:b.adminUserId||null,metadata:{incidentId:id,note:b.note||null}}});
    await this.log(`SAFETY_${b.action}`,'SafetyIncident',id,b);
    const users=[incident.trip.passengerUserId,incident.trip.driver?.userId].filter(Boolean) as string[];
    if(b.action==='ESCALATED'){
      for(const userId of new Set(users)) await this.notifications.sendToUser(userId,'SAFETY_ESCALATED','Seguridad URide','Operations elevó la prioridad de la alerta de seguridad y continúa monitoreando el viaje.',{tripId:incident.tripId,incidentId:id});
    }
    return updated;
  }





  aiOperationsBrief(adminUserId:string){ return this.ai.operationsBrief(adminUserId); }

  aiSupportAssist(ticketId:string,adminUserId:string,message?:string){
    return this.ai.supportAssist(ticketId,adminUserId,message);
  }


  pricingRules(){
    return this.prisma.pricingRule.findMany({orderBy:[{serviceType:'asc'},{updatedAt:'desc'}],take:100});
  }

  async createPricingRule(b:any){
    const serviceType=String(b.serviceType||'STANDARD').toUpperCase();
    const values=['baseFare','perMile','perMinute','bookingFee','minimumFare'];
    for(const k of values) if(!Number.isFinite(Number(b[k]))||Number(b[k])<0) throw new BadRequestException(`${k} must be a valid non-negative number`);
    const commission=Math.max(0,Math.min(0.60,Number(b.platformCommissionRate??0.20)));
    await this.prisma.pricingRule.updateMany({where:{serviceType,isActive:true},data:{isActive:false}});
    const rule=await this.prisma.pricingRule.create({data:{
      serviceType,baseFare:Number(b.baseFare),perMile:Number(b.perMile),perMinute:Number(b.perMinute),
      bookingFee:Number(b.bookingFee),minimumFare:Number(b.minimumFare),platformCommissionRate:commission,isActive:true,
    }});
    await this.log('PRICING_RULE_CREATED','PricingRule',rule.id,{...b,platformCommissionRate:commission});
    return rule;
  }

  async setPricingRuleActive(id:string,isActive:boolean,b:any){
    const rule=await this.prisma.pricingRule.findUnique({where:{id}});
    if(!rule) throw new NotFoundException('Pricing rule not found');
    if(isActive) await this.prisma.pricingRule.updateMany({where:{serviceType:rule.serviceType,isActive:true,id:{not:id}},data:{isActive:false}});
    const updated=await this.prisma.pricingRule.update({where:{id},data:{isActive}});
    await this.log('PRICING_RULE_STATUS_CHANGED','PricingRule',id,{...b,isActive});
    return updated;
  }

  bonusCampaigns(){ return this.earnings.listBonusCampaigns(); }

  async createBonusCampaign(b:any){
    const c=await this.earnings.createBonusCampaign(b);
    await this.log('BONUS_CAMPAIGN_CREATED','DriverBonusCampaign',c.id,b);
    return c;
  }

  async setBonusCampaignActive(id:string,isActive:boolean,b:any){
    const c=await this.earnings.setBonusCampaignActive(id,isActive);
    await this.log('BONUS_CAMPAIGN_STATUS_CHANGED','DriverBonusCampaign',id,{...b,isActive});
    return c;
  }


  riskCases(status?:string){
    return this.prisma.riskCase.findMany({
      where:status?{status:status as any}:{status:{in:['OPEN','REVIEWING','RESTRICTED']}},
      include:{user:{select:{id:true,email:true,phone:true,role:true,riskScore:true,riskLevel:true,tripRequestsBlockedUntil:true,paymentsBlockedUntil:true}}},
      orderBy:[{level:'desc'},{createdAt:'asc'}],
      take:200,
    });
  }

  async riskUser(userId:string){
    const user=await this.prisma.user.findUnique({
      where:{id:userId},
      select:{id:true,email:true,phone:true,role:true,isActive:true,riskScore:true,riskLevel:true,tripRequestsBlockedUntil:true,paymentsBlockedUntil:true},
    });
    if(!user) throw new NotFoundException('User not found');
    const [signals,cases,devices,trips,payments]=await Promise.all([
      this.prisma.riskSignal.findMany({where:{userId},orderBy:{createdAt:'desc'},take:100}),
      this.prisma.riskCase.findMany({where:{userId},orderBy:{createdAt:'desc'},take:30}),
      this.prisma.riskDevice.findMany({where:{userId},orderBy:{lastSeenAt:'desc'},take:30}),
      this.prisma.trip.findMany({where:{passengerUserId:userId},orderBy:{createdAt:'desc'},take:20}),
      this.prisma.payment.findMany({where:{trip:{passengerUserId:userId}},orderBy:{createdAt:'desc'},take:20}),
    ]);
    return {...user,signals,cases,devices:devices.map(d=>({...d,deviceHash:d.deviceHash.slice(0,12)+'…'})),trips,payments};
  }

  async reviewRiskCase(id:string,b:any){
    const riskCase=await this.prisma.riskCase.findUnique({where:{id},include:{user:true}});
    if(!riskCase) throw new NotFoundException('Risk case not found');
    const decision=String(b.decision||'WATCH').toUpperCase();
    if(!['CLEAR','WATCH','RESTRICT','SUSPEND'].includes(decision)) throw new BadRequestException('Invalid risk decision');
    const now=new Date();
    const restrictionHours=Math.max(1,Math.min(Number(b.restrictionHours||24),168));
    let status:any='REVIEWING';
    const userData:any={riskReviewedAt:now};
    if(decision==='CLEAR'){
      status='CLEARED';
      userData.tripRequestsBlockedUntil=null;
      userData.paymentsBlockedUntil=null;
      userData.riskScore=Math.min(riskCase.user.riskScore,24);
      userData.riskLevel='LOW';
    }else if(decision==='WATCH'){
      status='REVIEWING';
    }else if(decision==='RESTRICT'){
      status='RESTRICTED';
      const until=new Date(Date.now()+restrictionHours*60*60*1000);
      userData.tripRequestsBlockedUntil=b.blockTrips===false?undefined:until;
      userData.paymentsBlockedUntil=b.blockPayments===false?undefined:until;
    }else if(decision==='SUSPEND'){
      status='CLOSED';
      userData.isActive=false;
      userData.tripRequestsBlockedUntil=null;
      userData.paymentsBlockedUntil=null;
      const driver=await this.prisma.driverProfile.findUnique({where:{userId:riskCase.userId}});
      if(driver) await this.prisma.driverProfile.update({where:{id:driver.id},data:{availability:'OFFLINE',status:'SUSPENDED'}});
    }
    const updated=await this.prisma.$transaction(async tx=>{
      await tx.user.update({where:{id:riskCase.userId},data:userData});
      return tx.riskCase.update({where:{id},data:{
        status,decision:decision as any,assignedAdminUserId:b.adminUserId||null,reviewNote:b.reviewNote||null,
        resolvedAt:['CLEARED','CLOSED'].includes(status)?now:null,
      }});
    });
    await this.log('RISK_CASE_REVIEWED','RiskCase',id,{...b,decision,status});
    await this.notifications.sendToUser(riskCase.userId,'RISK_REVIEW_UPDATED','Actualización de cuenta URide',
      decision==='CLEAR'?'La revisión de tu cuenta fue completada.':
      decision==='RESTRICT'?'Algunas acciones están temporalmente limitadas mientras URide completa la revisión.':
      decision==='SUSPEND'?'Tu cuenta fue suspendida después de una revisión manual.':
      'Tu cuenta continúa en revisión.',
      {riskCaseId:id,decision,status}
    );
    return updated;
  }


  refunds(status?:string){
    return this.prisma.refundRequest.findMany({
      where:status?{status:status as any}:{status:{in:['REQUESTED','UNDER_REVIEW','APPROVED']}},
      include:{trip:{include:{payments:{include:{receipt:true}}}}},
      orderBy:{createdAt:'asc'},
      take:100,
    });
  }

  async updateRefund(id:string,b:any){
    const refund=await this.prisma.refundRequest.findUnique({where:{id}});
    if(!refund) throw new NotFoundException('Refund not found');
    const allowed=['REQUESTED','UNDER_REVIEW','APPROVED','REJECTED','PROCESSED'];
    if(b.status && !allowed.includes(b.status)) throw new BadRequestException('Invalid refund status');
    let providerRefund:any=null;
    if(b.status==='PROCESSED'){
      const payment=await this.prisma.payment.findFirst({where:{tripId:refund.tripId,status:{in:['SUCCEEDED','PARTIALLY_REFUNDED']},provider:'STRIPE'},orderBy:{createdAt:'desc'}});
      if(!payment) throw new BadRequestException('No refundable Stripe payment exists for this trip');
      const requested=refund.amountRequested?Number(refund.amountRequested):Number(payment.amount);
      const approved=b.amountApproved===undefined?(refund.amountApproved?Number(refund.amountApproved):requested):Number(b.amountApproved);
      providerRefund=await this.payments.refundPayment(payment.id,{amount:approved,idempotencyKey:`admin-refund-${id}`});
    }
    const updated=await this.prisma.refundRequest.update({where:{id},data:{
      status:b.status||undefined,
      amountApproved:b.amountApproved===undefined?undefined:Number(b.amountApproved),
      resolutionNote:b.resolutionNote||undefined,
      processedAt:b.status==='PROCESSED'?new Date():undefined,
    }});
    await this.log('REFUND_UPDATED','RefundRequest',id,{...b,providerRefundId:providerRefund?.refund?.id||null});
    await this.notifications.sendToUser(refund.requesterUserId,'REFUND_UPDATED','Actualización de reembolso',`Tu solicitud de reembolso está ahora en estado ${updated.status}.`,{refundRequestId:id,status:updated.status});
    return updated;
  }

  audit(){
    return this.prisma.adminAuditLog.findMany({orderBy:{createdAt:'desc'},take:200});
  }
}
