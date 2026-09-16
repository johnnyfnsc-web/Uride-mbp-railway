import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RiskService } from './risk.service';

@Controller('v1/risk')
export class RiskController {
  constructor(private readonly risk:RiskService){}

  @Post('devices/register') registerDevice(@Body() b:any){ return this.risk.registerDevice(b); }
  @Get('users/:userId/summary') summary(@Param('userId') userId:string){ return this.risk.summary(userId); }
  @Post('users/:userId/evaluate') evaluate(@Param('userId') userId:string){ return this.risk.recalculate(userId); }
}
