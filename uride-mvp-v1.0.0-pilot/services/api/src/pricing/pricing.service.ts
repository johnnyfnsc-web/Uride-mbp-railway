import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  async quote(dto: any) {
    const miles = Number(dto.estimatedMiles);
    const minutes = Number(dto.estimatedMinutes);
    if (!Number.isFinite(miles) || miles < 0 || !Number.isFinite(minutes) || minutes < 0) {
      throw new BadRequestException('estimatedMiles and estimatedMinutes must be valid positive numbers');
    }
    const serviceType = dto.serviceType || 'STANDARD';
    let rule = await this.prisma.pricingRule.findFirst({ where: { serviceType, isActive: true }, orderBy: { updatedAt: 'desc' } });
    if (!rule) {
      rule = await this.prisma.pricingRule.create({ data: { serviceType, baseFare: 2.5, perMile: 1.65, perMinute: 0.28, bookingFee: 1.5, minimumFare: 7, platformCommissionRate: 0.20 } });
    }
    const raw = Number(rule.baseFare) + miles * Number(rule.perMile) + minutes * Number(rule.perMinute) + Number(rule.bookingFee);
    const estimatedFare = Math.max(raw, Number(rule.minimumFare));
    const commissionRate=Math.max(0,Math.min(0.60,Number(rule.platformCommissionRate)));
    const estimatedPlatformFee=Number((estimatedFare*commissionRate).toFixed(2));
    const estimatedDriverEarnings=Number((estimatedFare-estimatedPlatformFee).toFixed(2));
    return {
      serviceType,currency:'USD',estimatedMiles:miles,estimatedMinutes:minutes,estimatedFare:Number(estimatedFare.toFixed(2)),
      commissionRate,estimatedPlatformFee,estimatedDriverEarnings,
      breakdown:{
        baseFare:Number(rule.baseFare),distance:Number((miles*Number(rule.perMile)).toFixed(2)),
        time:Number((minutes*Number(rule.perMinute)).toFixed(2)),bookingFee:Number(rule.bookingFee),
        minimumFare:Number(rule.minimumFare),
      },
    };
  }
}
