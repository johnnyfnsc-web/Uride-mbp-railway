import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
@Controller('v1/auth') export class AuthController { constructor(private auth:AuthService){} @Post('register') register(@Body() body:any){return this.auth.register(body)} @Post('login') login(@Body() body:any){return this.auth.login(body)} }
