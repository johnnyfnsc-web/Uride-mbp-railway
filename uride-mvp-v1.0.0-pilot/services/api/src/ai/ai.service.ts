import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AiService {
  constructor(private prisma:PrismaService){}

  private normalize(s:any){ return String(s||'').trim(); }

  private blockedIntent(text:string){
    const t=text.toLowerCase();
    const rules=[
      {keys:['reembolsa','refund now','haz el reembolso'],action:'ISSUE_REFUND'},
      {keys:['suspende','ban this','bloquea la cuenta'],action:'SUSPEND_ACCOUNT'},
      {keys:['llama al 911','call 911','contacta emergencias'],action:'CONTACT_EMERGENCY_SERVICES'},
      {keys:['aprueba documento','approve document'],action:'APPROVE_DOCUMENT'},
      {keys:['cambia la tarifa','change fare','sube el precio'],action:'CHANGE_PRICING'},
      {keys:['cobra la tarjeta','charge card','procesa el pago'],action:'CHARGE_PAYMENT'},
    ];
    return rules.find(r=>r.keys.some(k=>t.includes(k)))?.action||null;
  }

  private async saveRun(data:any){
    return this.prisma.aiAssistantRun.create({data:{
      userId:data.userId||null,audience:data.audience,tripId:data.tripId||null,supportTicketId:data.supportTicketId||null,
      inputText:data.inputText,responseText:data.responseText,status:data.status||'COMPLETED',
      modelProvider:'FOUNDATION_RULES',modelName:'uride-context-v1',blockedAction:data.blockedAction||null,
      contextSnapshot:data.contextSnapshot||undefined,
    }});
  }

  private tripStatusText(status:string){
    const map:any={
      SCHEDULED:'Tu viaje está programado.',
      SEARCHING:'URide está buscando un conductor disponible.',
      DRIVER_ASSIGNED:'Ya tienes un conductor asignado.',
      DRIVER_ARRIVING:'Tu conductor va hacia el punto de recogida.',
      DRIVER_ARRIVED:'Tu conductor llegó al punto de recogida.',
      IN_PROGRESS:'Tu viaje está en progreso.',
      COMPLETED:'El viaje está completado.',
      CANCELLED:'El viaje fue cancelado.',
      NO_SHOW:'El viaje terminó como no-show.',
    };
    return map[status]||`El viaje está en estado ${status}.`;
  }

  async assistPassenger(dto:any){
    const userId=this.normalize(dto.userId),message=this.normalize(dto.message);
    if(!userId||!message) throw new BadRequestException('userId and message are required');
    const user=await this.prisma.user.findUnique({where:{id:userId}});
    if(!user||user.role!=='PASSENGER') throw new NotFoundException('Passenger not found');

    let trip:any=null;
    if(dto.tripId){
      trip=await this.prisma.trip.findUnique({
        where:{id:dto.tripId},
        include:{driver:true,vehicle:true,locations:{orderBy:{recordedAt:'desc'},take:1},payments:{include:{receipt:true},orderBy:{createdAt:'desc'},take:1}},
      });
      if(!trip||trip.passengerUserId!==userId) throw new BadRequestException('Passenger does not own this trip');
    }

    const blocked=this.blockedIntent(message);
    if(blocked){
      const response='Puedo explicarte el estado y los pasos disponibles, pero no puedo ejecutar esa acción crítica por mi cuenta. Usa el flujo autorizado de URide o Soporte.';
      const run=await this.saveRun({userId,audience:'PASSENGER',tripId:trip?.id,inputText:message,responseText:response,status:'BLOCKED',blockedAction:blocked});
      return {answer:response,requiresHumanAction:true,blockedAction:blocked,runId:run.id};
    }

    const lower=message.toLowerCase();
    let answer='Puedo ayudarte con el estado del viaje, conductor, tarifa, pago, seguridad, objetos perdidos, reservas y soporte.';
    if(trip){
      if(lower.includes('dónde')||lower.includes('donde')||lower.includes('conductor')||lower.includes('driver')){
        const loc=trip.locations?.[0];
        answer=`${this.tripStatusText(trip.status)}${loc?' La última ubicación del conductor fue actualizada dentro de URide.':' Todavía no hay una ubicación reciente del conductor disponible.'}`;
      }else if(lower.includes('precio')||lower.includes('tarifa')||lower.includes('cost')){
        answer=`La tarifa estimada de este viaje es $${Number(trip.estimatedFare).toFixed(2)}${trip.finalFare?` y la tarifa final registrada es $${Number(trip.finalFare).toFixed(2)}`:''}. Si hubo cambios autorizados, peajes o ajustes, el recibo debe mostrarlos por separado.`;
      }else if(lower.includes('pago')||lower.includes('payment')||lower.includes('recibo')){
        const p=trip.payments?.[0];
        answer=p?`El pago más reciente está en estado ${p.status} por $${Number(p.amount).toFixed(2)}.${p.receipt?' El recibo ya está disponible.':''}`:'Todavía no hay un pago registrado para este viaje.';
      }else if(lower.includes('seguridad')||lower.includes('sos')||lower.includes('emergencia')){
        answer='Si existe peligro inmediato, usa los servicios de emergencia disponibles en tu localidad. En URide también puedes usar SOS para abrir una alerta prioritaria para Operations. La IA no llama a emergencias automáticamente.';
      }else{
        answer=this.tripStatusText(trip.status);
      }
    }

    const context=trip?{status:trip.status,estimatedFare:Number(trip.estimatedFare),finalFare:trip.finalFare?Number(trip.finalFare):null,hasDriver:!!trip.driver,hasRecentLocation:!!trip.locations?.[0],latestPaymentStatus:trip.payments?.[0]?.status||null}:null;
    const run=await this.saveRun({userId,audience:'PASSENGER',tripId:trip?.id,inputText:message,responseText:answer,contextSnapshot:context});
    return {answer,requiresHumanAction:false,runId:run.id};
  }

  async assistDriver(dto:any){
    const userId=this.normalize(dto.userId),message=this.normalize(dto.message);
    if(!userId||!message) throw new BadRequestException('userId and message are required');
    const driver=await this.prisma.driverProfile.findUnique({where:{userId},include:{user:true}});
    if(!driver) throw new NotFoundException('Driver not found');

    let trip:any=null;
    if(dto.tripId){
      trip=await this.prisma.trip.findUnique({where:{id:dto.tripId},include:{payments:true}});
      if(!trip||trip.driverProfileId!==driver.id) throw new BadRequestException('Driver is not assigned to this trip');
    }

    const blocked=this.blockedIntent(message);
    if(blocked){
      const response='Puedo recomendar el siguiente paso, pero no puedo ejecutar acciones críticas, financieras, disciplinarias o de emergencia por mi cuenta.';
      const run=await this.saveRun({userId,audience:'DRIVER',tripId:trip?.id,inputText:message,responseText:response,status:'BLOCKED',blockedAction:blocked});
      return {answer:response,requiresHumanAction:true,blockedAction:blocked,runId:run.id};
    }

    const lower=message.toLowerCase();
    let answer='Puedo ayudarte con el viaje actual, documentos, ganancias, bonos, pagos del conductor y soporte.';
    if(lower.includes('gan')||lower.includes('earning')||lower.includes('dinero')){
      const from=new Date(); from.setDate(from.getDate()-7);
      const entries=await this.prisma.driverLedgerEntry.findMany({where:{driverProfileId:driver.id,createdAt:{gte:from}}});
      const total=entries.reduce((a,e)=>a+Number(e.amount),0);
      answer=`En los últimos 7 días el ledger de URide registra $${total.toFixed(2)} para tu cuenta entre viajes, propinas, bonos y ajustes. Revisa “Mis ganancias” para el desglose.`;
    }else if(lower.includes('bono')||lower.includes('bonus')){
      const now=new Date();
      const campaigns=await this.prisma.driverBonusCampaign.findMany({where:{isActive:true,startsAt:{lte:now},endsAt:{gte:now}}});
      answer=campaigns.length?`Hay ${campaigns.length} campaña(s) de bonos activa(s). Abre “Mis ganancias” para ver tu progreso exacto.`:'No hay campañas de bonos activas en este momento.';
    }else if(lower.includes('document')||lower.includes('licencia')||lower.includes('seguro')){
      const docs=await this.prisma.driverDocument.findMany({where:{driverProfileId:driver.id}});
      const expired=docs.filter(d=>d.expiresAt&&d.expiresAt<=new Date()).length;
      const pending=docs.filter(d=>d.status==='PENDING_REVIEW').length;
      answer=`Tu expediente tiene ${pending} documento(s) en revisión y ${expired} documento(s) vencido(s). Un documento obligatorio vencido puede impedir que te conectes.`;
    }else if(trip){
      answer=`El viaje está en estado ${trip.status}. Sigue el flujo normal de navegación y usa los controles de llegada/inicio/finalización correspondientes.`;
    }

    const context={driverStatus:driver.status,availability:driver.availability,tripStatus:trip?.status||null};
    const run=await this.saveRun({userId,audience:'DRIVER',tripId:trip?.id,inputText:message,responseText:answer,contextSnapshot:context});
    return {answer,requiresHumanAction:false,runId:run.id};
  }

  async supportAssist(ticketId:string,adminUserId:string,message?:string){
    const ticket=await this.prisma.supportTicket.findUnique({
      where:{id:ticketId},
      include:{requester:{select:{id:true,email:true,role:true,riskScore:true,riskLevel:true}},trip:{include:{payments:true,safetyIncidents:true}},messages:{orderBy:{createdAt:'asc'}}},
    });
    if(!ticket) throw new NotFoundException('Support ticket not found');
    const input=this.normalize(message)||'Resume el caso y recomienda los siguientes pasos.';
    const blocked=this.blockedIntent(input);
    let answer:string;
    if(blocked){
      answer='La acción solicitada requiere un flujo autorizado y una decisión humana. Puedo resumir la evidencia, pero no ejecutarla.';
    }else{
      const payment=ticket.trip?.payments?.[0];
      const safety=ticket.trip?.safetyIncidents?.filter(i=>i.status!=='RESOLVED')||[];
      answer=`Caso ${ticket.category} en estado ${ticket.status}. Hay ${ticket.messages.length} mensaje(s).${ticket.trip?` Viaje: ${ticket.trip.status}.`:''}${payment?` Pago: ${payment.status} por $${Number(payment.amount).toFixed(2)}.`:''}${safety.length?` Atención: hay ${safety.length} incidente(s) de seguridad activo(s).`:''} Recomendación: verificar los datos del viaje y responder dentro del ticket; cualquier reembolso, suspensión o decisión de seguridad debe realizarse mediante el control administrativo correspondiente.`;
    }
    const run=await this.saveRun({userId:adminUserId,audience:'SUPPORT',tripId:ticket.tripId,supportTicketId:ticket.id,inputText:input,responseText:answer,status:blocked?'BLOCKED':'COMPLETED',blockedAction:blocked,contextSnapshot:{category:ticket.category,status:ticket.status,messageCount:ticket.messages.length,riskLevel:ticket.requester.riskLevel}});
    return {answer,blockedAction:blocked,requiresHumanAction:!!blocked,runId:run.id};
  }

  async operationsBrief(adminUserId:string){
    const [activeTrips,onlineDrivers,openTickets,criticalSafety,highRisk,pendingRefunds]=await Promise.all([
      this.prisma.trip.count({where:{status:{in:['SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS']}}}),
      this.prisma.driverProfile.count({where:{availability:{in:['ONLINE','ON_TRIP']}}}),
      this.prisma.supportTicket.count({where:{status:{in:['OPEN','IN_PROGRESS','WAITING_USER']}}}),
      this.prisma.safetyIncident.count({where:{status:{in:['OPEN','ACKNOWLEDGED']},priority:'CRITICAL'}}),
      this.prisma.riskCase.count({where:{status:{in:['OPEN','REVIEWING','RESTRICTED']},level:{in:['HIGH','CRITICAL']}}}),
      this.prisma.refundRequest.count({where:{status:{in:['REQUESTED','UNDER_REVIEW','APPROVED']}}}),
    ]);
    const priorities:string[]=[];
    if(criticalSafety) priorities.push(`${criticalSafety} incidente(s) crítico(s) de seguridad`);
    if(highRisk) priorities.push(`${highRisk} caso(s) HIGH/CRITICAL de Risk`);
    if(openTickets) priorities.push(`${openTickets} ticket(s) de soporte abiertos`);
    if(pendingRefunds) priorities.push(`${pendingRefunds} reembolso(s) pendientes`);
    const answer=`Operations: ${activeTrips} viaje(s) activos y ${onlineDrivers} Driver(s) conectados. Prioridades actuales: ${priorities.length?priorities.join(', '):'sin alertas operativas prioritarias'}. La IA solo organiza y recomienda; Operations conserva la decisión y ejecución de acciones.`;
    const run=await this.saveRun({userId:adminUserId,audience:'OPERATIONS',inputText:'Generar resumen operativo',responseText:answer,contextSnapshot:{activeTrips,onlineDrivers,openTickets,criticalSafety,highRisk,pendingRefunds}});
    return {answer,metrics:{activeTrips,onlineDrivers,openTickets,criticalSafety,highRisk,pendingRefunds},runId:run.id};
  }

  async history(userId:string){
    return this.prisma.aiAssistantRun.findMany({where:{userId},orderBy:{createdAt:'desc'},take:50});
  }
}
