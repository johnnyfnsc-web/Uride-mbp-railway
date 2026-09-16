import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('v1/ai')
export class AiController {
  constructor(private readonly ai:AiService){}

  @Post('passenger/assist')
  passenger(@Body() b:any){ return this.ai.assistPassenger(b); }

  @Post('driver/assist')
  driver(@Body() b:any){ return this.ai.assistDriver(b); }

  @Get('users/:userId/history')
  history(@Param('userId') userId:string){ return this.ai.history(userId); }
}
