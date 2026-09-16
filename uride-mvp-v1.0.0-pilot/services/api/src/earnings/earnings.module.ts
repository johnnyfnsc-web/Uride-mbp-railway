import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';

@Module({
  imports:[DatabaseModule],
  controllers:[EarningsController],
  providers:[EarningsService],
  exports:[EarningsService],
})
export class EarningsModule {}
