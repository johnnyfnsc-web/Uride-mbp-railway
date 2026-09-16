import { Body, Controller, Post } from '@nestjs/common';
import { PricingService } from './pricing.service';
@Controller('v1/pricing')
export class PricingController { constructor(private pricing: PricingService) {} @Post('quote') quote(@Body() body:any){ return this.pricing.quote(body); } }
