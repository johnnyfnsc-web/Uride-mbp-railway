import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

@UseGuards(AdminGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard') dashboard(){ return this.admin.dashboard(); }
  @Get('drivers/pending') pendingDrivers(){ return this.admin.pendingDrivers(); }
  @Patch('drivers/:driverProfileId/status') driverStatus(@Param('driverProfileId') id:string,@Body() b:any,@Req() req:any){ return this.admin.setDriverStatus(id,{...b,adminUserId:req.adminUserId}); }
  @Patch('vehicles/:vehicleId/status') vehicleStatus(@Param('vehicleId') id:string,@Body() b:any,@Req() req:any){ return this.admin.setVehicleStatus(id,{...b,adminUserId:req.adminUserId}); }
  @Get('documents/pending') pendingDocuments(){ return this.admin.pendingDocuments(); }
  @Patch('documents/:documentId/status') documentStatus(@Param('documentId') id:string,@Body() b:any,@Req() req:any){ return this.admin.setDocumentStatus(id,{...b,adminUserId:req.adminUserId}); }

  @Get('trips/active') activeTrips(){ return this.admin.activeTrips(); }
  @Get('support/tickets') tickets(@Query('status') status?:string){ return this.admin.supportTickets(status); }
  @Patch('support/tickets/:ticketId') ticket(@Param('ticketId') id:string,@Body() b:any,@Req() req:any){ return this.admin.updateTicket(id,{...b,adminUserId:req.adminUserId}); }

  @Get('safety/incidents') incidents(@Query('status') status?:string){ return this.admin.safetyIncidents(status); }
  @Patch('safety/incidents/:incidentId') incident(@Param('incidentId') id:string,@Body() b:any,@Req() req:any){ return this.admin.updateIncident(id,{...b,adminUserId:req.adminUserId}); }
  @Post('safety/incidents/:incidentId/actions') incidentAction(@Param('incidentId') id:string,@Body() b:any,@Req() req:any){ return this.admin.safetyAction(id,{...b,adminUserId:req.adminUserId}); }
  @Get('safety/trips/:tripId/monitor') safetyMonitor(@Param('tripId') tripId:string){ return this.admin.safetyMonitor(tripId); }

  @Get('ai/operations-brief') aiBrief(@Req() req:any){ return this.admin.aiOperationsBrief(req.adminUserId); }
  @Post('ai/support/:ticketId/assist') aiSupport(@Param('ticketId') id:string,@Body() b:any,@Req() req:any){ return this.admin.aiSupportAssist(id,req.adminUserId,b.message); }

  @Get('pricing/rules') pricingRules(){ return this.admin.pricingRules(); }
  @Post('pricing/rules') createPricingRule(@Body() b:any,@Req() req:any){ return this.admin.createPricingRule({...b,adminUserId:req.adminUserId}); }
  @Patch('pricing/rules/:ruleId/status') pricingRuleStatus(@Param('ruleId') id:string,@Body() b:any,@Req() req:any){ return this.admin.setPricingRuleActive(id,!!b.isActive,{...b,adminUserId:req.adminUserId}); }

  @Get('bonuses') bonuses(){ return this.admin.bonusCampaigns(); }
  @Post('bonuses') createBonus(@Body() b:any,@Req() req:any){ return this.admin.createBonusCampaign({...b,adminUserId:req.adminUserId}); }
  @Patch('bonuses/:campaignId/status') bonusStatus(@Param('campaignId') id:string,@Body() b:any,@Req() req:any){ return this.admin.setBonusCampaignActive(id,!!b.isActive,{...b,adminUserId:req.adminUserId}); }

  @Get('risk/cases') riskCases(@Query('status') status?:string){ return this.admin.riskCases(status); }
  @Get('risk/users/:userId') riskUser(@Param('userId') userId:string){ return this.admin.riskUser(userId); }
  @Post('risk/cases/:caseId/review') riskReview(@Param('caseId') id:string,@Body() b:any,@Req() req:any){ return this.admin.reviewRiskCase(id,{...b,adminUserId:req.adminUserId}); }

  @Get('refunds') refunds(@Query('status') status?:string){ return this.admin.refunds(status); }
  @Patch('refunds/:refundId') refund(@Param('refundId') id:string,@Body() b:any,@Req() req:any){ return this.admin.updateRefund(id,{...b,adminUserId:req.adminUserId}); }

  @Get('audit') audit(){ return this.admin.audit(); }
}
