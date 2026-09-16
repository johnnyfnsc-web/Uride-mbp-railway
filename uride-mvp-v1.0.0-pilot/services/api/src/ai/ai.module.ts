import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports:[DatabaseModule],
  controllers:[AiController],
  providers:[AiService],
  exports:[AiService],
})
export class AiModule {}
