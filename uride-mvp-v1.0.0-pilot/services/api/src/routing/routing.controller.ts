import { Body, Controller, Post } from '@nestjs/common';
import { RoutingService } from './routing.service';

@Controller('v1/routing')
export class RoutingController {
  constructor(private routing: RoutingService) {}

  @Post('route')
  route(@Body() body: any) {
    return this.routing.route(
      { lat: Number(body?.origin?.lat), lng: Number(body?.origin?.lng) },
      { lat: Number(body?.destination?.lat), lng: Number(body?.destination?.lng) },
    );
  }
}
