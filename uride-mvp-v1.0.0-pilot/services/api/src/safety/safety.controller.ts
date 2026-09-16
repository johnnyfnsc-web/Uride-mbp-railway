import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SafetyService } from './safety.service';

@Controller('v1/safety')
export class SafetyController {
  constructor(private readonly safety:SafetyService){}

  @Post('contacts') addContact(@Body() b:any){ return this.safety.addTrustedContact(b); }
  @Get('contacts/:userId') contacts(@Param('userId') userId:string){ return this.safety.contacts(userId); }

  @Post('trips/:tripId/sos') sos(@Param('tripId') tripId:string,@Body() b:any){
    return this.safety.createIncident(tripId,{...b,type:'SOS'});
  }

  @Post('trips/:tripId/incidents') incident(@Param('tripId') tripId:string,@Body() b:any){
    return this.safety.createIncident(tripId,b);
  }

  @Get('trips/:tripId/incidents') incidents(@Param('tripId') tripId:string){
    return this.safety.tripIncidents(tripId);
  }

  @Get('trips/:tripId/share') share(@Param('tripId') tripId:string){
    return this.safety.shareSnapshot(tripId);
  }

  @Post('trips/:tripId/share-links') createShareLink(@Param('tripId') tripId:string,@Body() b:any){
    return this.safety.createShareLink(tripId,b);
  }

  @Patch('share-links/:linkId/revoke') revoke(@Param('linkId') id:string,@Body() b:any){
    return this.safety.revokeShareLink(id,b);
  }

  @Get('share/:token') publicShare(@Param('token') token:string){
    return this.safety.resolveShareLink(token);
  }
}
