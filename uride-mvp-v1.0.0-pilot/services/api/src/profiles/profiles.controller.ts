import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UserGuard } from '../auth/user.guard';

@UseGuards(UserGuard)
@Controller('v1')
export class ProfilesController {
  constructor(private prisma:PrismaService){}

  @Get('users/:userId/profile')
  async profile(@Param('userId') userId:string,@Req() req:any){
    if(req.userId!==userId&&req.userRole!=='ADMIN') throw new ForbiddenException('Profile access denied');
    const u=await this.prisma.user.findUnique({
      where:{id:userId},
      select:{id:true,email:true,phone:true,role:true,passengerProfile:true,driverProfile:{include:{vehicles:true,documents:true}}},
    });
    if(!u) throw new NotFoundException();
    return u;
  }

  @Post('drivers/:userId/vehicles')
  async vehicle(@Param('userId') userId:string,@Body() b:any,@Req() req:any){
    if(req.userRole!=='DRIVER'||req.userId!==userId) throw new ForbiddenException('Driver access denied');
    const d=await this.prisma.driverProfile.findUnique({where:{userId}});
    if(!d) throw new NotFoundException('Driver profile not found');
    return this.prisma.vehicle.create({data:{driverProfileId:d.id,make:b.make,model:b.model,year:Number(b.year),color:b.color,plate:b.plate,state:b.state,vin:b.vin}});
  }
}
