import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EarningsService } from './earnings.service';

@Controller('v1/earnings')
export class EarningsController {
  constructor(private readonly earnings:EarningsService){}

  @Get('drivers/:driverUserId/summary')
  summary(@Param('driverUserId') id:string,@Query('period') period?:string){ return this.earnings.summary(id,period||'WEEK'); }

  @Get('drivers/:driverUserId/history')
  history(@Param('driverUserId') id:string,@Query('limit') limit?:string){ return this.earnings.history(id,limit?Number(limit):100); }

  @Get('drivers/:driverUserId/bonuses')
  bonuses(@Param('driverUserId') id:string){ return this.earnings.bonusProgress(id); }

  @Post('drivers/:driverUserId/refresh-bonuses')
  refreshBonuses(@Param('driverUserId') id:string){ return this.earnings.evaluateBonusesByUser(id); }
}
