import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RiskService } from '../risk/risk.service';

@Injectable()
export class SupportService {
  constructor(private prisma:PrismaService, private realtime:RealtimeService, private risk:RiskService){}

  async createTicket(dto:any){
    if(!dto.requesterUserId || !dto.subject || !dto.description) throw new BadRequestException('requesterUserId, subject and description are required');
    const user=await this.prisma.user.findUnique({where:{id:dto.requesterUserId}});
    if(!user) throw new NotFoundException('User not found');
    if(dto.tripId){
      const trip=await this.prisma.trip.findUnique({where:{id:dto.tripId}});
      if(!trip) throw new NotFoundException('Trip not found');
    }
    const allowed=['TRIP','PAYMENT','CANCELLATION','DRIVER_PASSENGER','SAFETY','LOST_ITEM','REFUND','DISPUTE','OTHER'];
    const category=allowed.includes(String(dto.category||'OTHER').toUpperCase())?String(dto.category||'OTHER').toUpperCase():'OTHER';
    const ticket=await this.prisma.supportTicket.create({
      data:{
        tripId:dto.tripId||null,
        requesterUserId:dto.requesterUserId,
        category:category as any,
        priority:(dto.priority||'NORMAL') as any,
        subject:dto.subject,
        description:dto.description,
        messages:{create:{senderUserId:dto.requesterUserId,senderRole:user.role,message:dto.description}},
      },
      include:{messages:true},
    });
    if(dto.tripId){
      await this.prisma.tripEvent.create({data:{tripId:dto.tripId,type:'SUPPORT_TICKET_OPENED',actorUserId:dto.requesterUserId,metadata:{ticketId:ticket.id,category}}});
      this.realtime.publish(dto.tripId,'SUPPORT_TICKET_OPENED',{ticketId:ticket.id,category});
    }
    return ticket;
  }

  listTickets(userId?:string,status?:string){
    return this.prisma.supportTicket.findMany({
      where:{...(userId?{requesterUserId:userId}:{}),...(status?{status:status as any}:{})},
      include:{trip:true,messages:{orderBy:{createdAt:'asc'},take:1}},
      orderBy:[{priority:'desc'},{createdAt:'desc'}],
    });
  }

  async getTicket(id:string){
    const ticket=await this.prisma.supportTicket.findUnique({where:{id},include:{trip:true,messages:{orderBy:{createdAt:'asc'}}}});
    if(!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async addMessage(id:string,dto:any){
    const ticket=await this.prisma.supportTicket.findUnique({where:{id}});
    if(!ticket) throw new NotFoundException('Support ticket not found');
    if(!dto.message?.trim()) throw new BadRequestException('message is required');
    const message=await this.prisma.supportMessage.create({
      data:{ticketId:id,senderUserId:dto.senderUserId||null,senderRole:dto.senderRole||'USER',message:dto.message.trim()},
    });
    await this.prisma.supportTicket.update({where:{id},data:{status:dto.senderRole==='AGENT'?'WAITING_USER':'OPEN'}});
    return message;
  }

  async updateTicketStatus(id:string,dto:any){
    const ticket=await this.prisma.supportTicket.findUnique({where:{id}});
    if(!ticket) throw new NotFoundException('Support ticket not found');
    const allowed=['OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED'];
    if(!allowed.includes(dto.status)) throw new BadRequestException('Invalid ticket status');
    return this.prisma.supportTicket.update({where:{id},data:{status:dto.status,resolvedAt:dto.status==='RESOLVED'?new Date():undefined,assignedAgentUserId:dto.assignedAgentUserId||undefined}});
  }

  async reportLostItem(dto:any){
    if(!dto.tripId||!dto.reporterUserId||!dto.itemType||!dto.description) throw new BadRequestException('tripId, reporterUserId, itemType and description are required');
    const trip=await this.prisma.trip.findUnique({where:{id:dto.tripId}});
    if(!trip) throw new NotFoundException('Trip not found');
    const item=await this.prisma.lostItem.create({data:{tripId:dto.tripId,reporterUserId:dto.reporterUserId,itemType:dto.itemType,description:dto.description,photoUrl:dto.photoUrl||null}});
    await this.prisma.tripEvent.create({data:{tripId:dto.tripId,type:'LOST_ITEM_REPORTED',actorUserId:dto.reporterUserId,metadata:{lostItemId:item.id,itemType:item.itemType}}});
    this.realtime.publish(dto.tripId,'LOST_ITEM_REPORTED',{lostItemId:item.id,status:item.status});
    return item;
  }

  lostItemsByTrip(tripId:string){
    return this.prisma.lostItem.findMany({where:{tripId},orderBy:{createdAt:'desc'}});
  }

  async updateLostItem(id:string,dto:any){
    const item=await this.prisma.lostItem.findUnique({where:{id}});
    if(!item) throw new NotFoundException('Lost item not found');
    const allowed=['REPORTED','CHECKING','FOUND','NOT_FOUND','RETURN_COORDINATING','RETURNED'];
    if(dto.status && !allowed.includes(dto.status)) throw new BadRequestException('Invalid lost item status');
    const updated=await this.prisma.lostItem.update({where:{id},data:{status:dto.status||undefined,driverResponse:dto.driverResponse||undefined,returnFee:dto.returnFee===undefined?undefined:Number(dto.returnFee)}});
    await this.prisma.tripEvent.create({data:{tripId:item.tripId,type:'LOST_ITEM_UPDATED',metadata:{lostItemId:id,status:updated.status}}});
    this.realtime.publish(item.tripId,'LOST_ITEM_UPDATED',{lostItemId:id,status:updated.status});
    return updated;
  }

  async requestRefund(dto:any){
    if(!dto.tripId||!dto.requesterUserId||!dto.reason) throw new BadRequestException('tripId, requesterUserId and reason are required');
    const trip=await this.prisma.trip.findUnique({where:{id:dto.tripId}});
    if(!trip) throw new NotFoundException('Trip not found');
    const refund=await this.prisma.refundRequest.create({data:{tripId:dto.tripId,requesterUserId:dto.requesterUserId,reason:dto.reason,amountRequested:dto.amountRequested===undefined?null:Number(dto.amountRequested)}});
    await this.prisma.tripEvent.create({data:{tripId:dto.tripId,type:'REFUND_REQUESTED',actorUserId:dto.requesterUserId,metadata:{refundRequestId:refund.id,reason:dto.reason}}});
    this.realtime.publish(dto.tripId,'REFUND_REQUESTED',{refundRequestId:refund.id,status:refund.status});
    const refundCount30d=await this.prisma.refundRequest.count({where:{requesterUserId:dto.requesterUserId,createdAt:{gte:new Date(Date.now()-30*24*60*60*1000)}}});
    if(refundCount30d>=4){
      const recent=await this.prisma.riskSignal.findFirst({where:{userId:dto.requesterUserId,type:'REFUND_ABUSE',createdAt:{gte:new Date(Date.now()-7*24*60*60*1000)}}});
      if(!recent) await this.risk.addSignal(dto.requesterUserId,'REFUND_ABUSE',{tripId:dto.tripId,metadata:{refundRequests30d:refundCount30d}});
    }
    return refund;
  }

  refundsByTrip(tripId:string){
    return this.prisma.refundRequest.findMany({where:{tripId},orderBy:{createdAt:'desc'}});
  }

  async updateRefund(id:string,dto:any){
    const refund=await this.prisma.refundRequest.findUnique({where:{id}});
    if(!refund) throw new NotFoundException('Refund request not found');
    const allowed=['REQUESTED','UNDER_REVIEW','APPROVED','REJECTED','PROCESSED'];
    if(dto.status && !allowed.includes(dto.status)) throw new BadRequestException('Invalid refund status');
    const updated=await this.prisma.refundRequest.update({where:{id},data:{status:dto.status||undefined,amountApproved:dto.amountApproved===undefined?undefined:Number(dto.amountApproved),resolutionNote:dto.resolutionNote||undefined,processedAt:dto.status==='PROCESSED'?new Date():undefined}});
    await this.prisma.tripEvent.create({data:{tripId:refund.tripId,type:'REFUND_UPDATED',metadata:{refundRequestId:id,status:updated.status,amountApproved:updated.amountApproved}}});
    this.realtime.publish(refund.tripId,'REFUND_UPDATED',{refundRequestId:id,status:updated.status});
    return updated;
  }
}
