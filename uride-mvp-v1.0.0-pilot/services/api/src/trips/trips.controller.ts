import { Body, Controller, ForbiddenException, Get, MessageEvent, Param, Patch, Post, Req, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TripsService } from './trips.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UserGuard } from '../auth/user.guard';

@UseGuards(UserGuard)
@Controller('v1/trips')
export class TripsController {
  constructor(private trips:TripsService,private realtime:RealtimeService){}

  private role(req:any,role:string){ if(req.userRole!==role) throw new ForbiddenException(`${role} role required`); }

  @Post() create(@Body() b:any,@Req() req:any){ this.role(req,'PASSENGER'); return this.trips.create({...b,passengerUserId:req.userId}); }

  @Get(':tripId') async get(@Param('tripId') id:string,@Req() req:any){
    const trip:any=await this.trips.get(id);
    const allowed=trip.passengerUserId===req.userId||trip.driver?.user?.id===req.userId||req.userRole==='ADMIN';
    if(!allowed) throw new ForbiddenException('Trip access denied');
    return trip;
  }

  @Sse(':tripId/stream') stream(@Param('tripId') id:string):Observable<MessageEvent>{ return this.realtime.stream(id); }

  @Post(':tripId/accept') accept(@Param('tripId') id:string,@Body() b:any,@Req() req:any){
    this.role(req,'DRIVER'); return this.trips.accept(id,req.userId,b.vehicleId,b.offerId);
  }

  @Patch(':tripId/arriving') arriving(@Param('tripId') id:string,@Req() req:any){ this.role(req,'DRIVER'); return this.trips.transition(id,'arriving',req.userId); }
  @Patch(':tripId/arrived') arrived(@Param('tripId') id:string,@Req() req:any){ this.role(req,'DRIVER'); return this.trips.transition(id,'arrived',req.userId); }
  @Patch(':tripId/start') start(@Param('tripId') id:string,@Req() req:any){ this.role(req,'DRIVER'); return this.trips.transition(id,'start',req.userId); }
  @Patch(':tripId/complete') complete(@Param('tripId') id:string,@Req() req:any){ this.role(req,'DRIVER'); return this.trips.transition(id,'complete',req.userId); }

  @Patch(':tripId/destination') changeDestination(@Param('tripId') id:string,@Body() b:any,@Req() req:any){
    this.role(req,'PASSENGER'); return this.trips.changeDestination(id,req.userId,b);
  }

  @Post(':tripId/cancel') cancel(@Param('tripId') id:string,@Body() b:any,@Req() req:any){
    if(!['PASSENGER','DRIVER'].includes(req.userRole)) throw new ForbiddenException('Passenger or Driver role required');
    return this.trips.cancel(id,{...b,actor:req.userRole,actorUserId:req.userId});
  }

  @Get(':tripId/wait-status') waitStatus(@Param('tripId') id:string,@Req() req:any){ this.role(req,'DRIVER'); return this.trips.waitStatus(id); }
  @Post(':tripId/no-show') noShow(@Param('tripId') id:string,@Req() req:any){ this.role(req,'DRIVER'); return this.trips.noShow(id,{actorUserId:req.userId}); }

  @Post(':tripId/rating') rate(@Param('tripId') id:string,@Body() b:any,@Req() req:any){
    if(!['PASSENGER','DRIVER'].includes(req.userRole)) throw new ForbiddenException('Passenger or Driver role required');
    return this.trips.rateTrip(id,{...b,fromUserId:req.userId});
  }

  @Post(':tripId/favorite-driver') favoriteDriver(@Param('tripId') id:string,@Req() req:any){ this.role(req,'PASSENGER'); return this.trips.favoriteDriver(id,req.userId); }
  @Post(':tripId/return-trip') returnTrip(@Param('tripId') id:string,@Body() b:any,@Req() req:any){ this.role(req,'PASSENGER'); return this.trips.createReturnTrip(id,{...b,passengerUserId:req.userId}); }
  @Post(':tripId/schedule-return') scheduleReturn(@Param('tripId') id:string,@Body() b:any,@Req() req:any){ this.role(req,'PASSENGER'); return this.trips.scheduleReturnTrip(id,{...b,passengerUserId:req.userId}); }
  @Get('passenger/:passengerUserId/upcoming') upcoming(@Req() req:any){ this.role(req,'PASSENGER'); return this.trips.upcoming(req.userId); }
  @Get('passenger/:passengerUserId/favorites') favorites(@Req() req:any){ this.role(req,'PASSENGER'); return this.trips.listFavorites(req.userId); }
  @Get('passenger/:passengerUserId/reminders') reminders(@Req() req:any){ this.role(req,'PASSENGER'); return this.trips.dueReminders(req.userId); }
}
