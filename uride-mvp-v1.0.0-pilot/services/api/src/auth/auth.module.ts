import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserGuard } from './user.guard';

@Module({
  controllers:[AuthController],
  providers:[AuthService,UserGuard],
  exports:[AuthService,UserGuard],
})
export class AuthModule {}
