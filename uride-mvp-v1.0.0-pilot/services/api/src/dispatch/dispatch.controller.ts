import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { UserGuard } from '../auth/user.guard';

@UseGuards(UserGuard)
@Controller('v1/dispatch')
export class DispatchController {
  constructor(private readonly dispatch:DispatchService){}

  @Get('trips/:tripId/candidates')
  candidates(@Param('tripId') tripId:string,@Query('radiusMiles') radiusMiles:string|undefined,@Query('limit') limit:string|undefined,@Req() req:any){
    if(req.userRole!=='ADMIN') throw new ForbiddenException('Admin role required');
    return this.dispatch.candidates(tripId,radiusMiles?Number(radiusMiles):12,limit?Number(limit):10);
  }

  @Get('drivers/:driverUserId/next-offer')
  nextOffer(@Param('driverUserId') driverUserId:string,@Query('radiusMiles') radiusMiles:string|undefined,@Query('ttlSeconds') ttlSeconds:string|undefined,@Req() req:any){
    if(req.userRole!=='DRIVER'||req.userId!==driverUserId) throw new ForbiddenException('Driver access denied');
    return this.dispatch.nextOffer(driverUserId,radiusMiles?Number(radiusMiles):20,ttlSeconds?Number(ttlSeconds):20);
  }

  @Post('offers/:offerId/reject')
  reject(@Param('offerId') offerId:string,@Body() body:any,@Req() req:any){
    if(req.userRole!=='DRIVER') throw new ForbiddenException('Driver role required');
    return this.dispatch.rejectOffer(offerId,req.userId);
  }

  @Post('process-offers')
  processOffers(@Req() req:any){
    if(req.userRole!=='ADMIN') throw new ForbiddenException('Admin role required');
    return this.dispatch.processDriverOffers();
  }
}
