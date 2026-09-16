import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SupportService } from './support.service';

@Controller('v1/support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets') createTicket(@Body() b:any){ return this.support.createTicket(b); }
  @Get('tickets') tickets(@Query('userId') userId?:string,@Query('status') status?:string){ return this.support.listTickets(userId,status); }
  @Get('tickets/:ticketId') ticket(@Param('ticketId') id:string){ return this.support.getTicket(id); }
  @Post('tickets/:ticketId/messages') message(@Param('ticketId') id:string,@Body() b:any){ return this.support.addMessage(id,b); }
  @Patch('tickets/:ticketId/status') status(@Param('ticketId') id:string,@Body() b:any){ return this.support.updateTicketStatus(id,b); }

  @Post('lost-items') lostItem(@Body() b:any){ return this.support.reportLostItem(b); }
  @Get('lost-items/trip/:tripId') lostItems(@Param('tripId') tripId:string){ return this.support.lostItemsByTrip(tripId); }
  @Patch('lost-items/:itemId') lostItemStatus(@Param('itemId') id:string,@Body() b:any){ return this.support.updateLostItem(id,b); }

  @Post('refunds') refund(@Body() b:any){ return this.support.requestRefund(b); }
  @Get('refunds/trip/:tripId') refunds(@Param('tripId') tripId:string){ return this.support.refundsByTrip(tripId); }
  @Patch('refunds/:refundId') refundStatus(@Param('refundId') id:string,@Body() b:any){ return this.support.updateRefund(id,b); }
}
