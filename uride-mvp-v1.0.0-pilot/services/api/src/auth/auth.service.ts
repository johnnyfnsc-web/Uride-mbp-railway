import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}
  private hash(password:string, salt=randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
  private jwtSecret(){ const secret=process.env.JWT_ACCESS_SECRET; if(!secret || secret.length<32) throw new UnauthorizedException('Server authentication is not configured'); return secret; }
  private verify(password:string, stored:string) { const [salt,key]=stored.split(':'); const a=scryptSync(password,salt,64); const b=Buffer.from(key,'hex'); return a.length===b.length && timingSafeEqual(a,b); }
  private token(payload:object) { const secret=this.jwtSecret(); const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'); const p=Buffer.from(JSON.stringify({...payload,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'); const s=createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url'); return `${h}.${p}.${s}`; }
  async register(dto:any) {
    if(!dto.email || !dto.password || !dto.role || !dto.firstName || !dto.lastName) throw new BadRequestException('email, password, role, firstName and lastName are required');
    if(dto.password.length < 8) throw new BadRequestException('Password must contain at least 8 characters');
    if(!['PASSENGER','DRIVER'].includes(dto.role)) throw new BadRequestException('role must be PASSENGER or DRIVER');
    const exists=await this.prisma.user.findUnique({where:{email:dto.email.toLowerCase()}}); if(exists) throw new BadRequestException('Email already registered');
    const user=await this.prisma.user.create({data:{email:dto.email.toLowerCase(),phone:dto.phone,passwordHash:this.hash(dto.password),role:dto.role,passengerProfile:dto.role==='PASSENGER'?{create:{firstName:dto.firstName,lastName:dto.lastName,preferredLanguage:dto.preferredLanguage||'en'}}:undefined,driverProfile:dto.role==='DRIVER'?{create:{firstName:dto.firstName,lastName:dto.lastName,preferredLanguage:dto.preferredLanguage||'en'}}:undefined},include:{passengerProfile:true,driverProfile:true}});
    return {accessToken:this.token({sub:user.id,role:user.role}),user:{id:user.id,email:user.email,role:user.role,passengerProfile:user.passengerProfile,driverProfile:user.driverProfile}};
  }
  async login(dto:any) { const user=await this.prisma.user.findUnique({where:{email:(dto.email||'').toLowerCase()}}); if(!user || !this.verify(dto.password||'',user.passwordHash)) throw new UnauthorizedException('Invalid credentials'); if(!user.isActive) throw new UnauthorizedException('Account is inactive'); return {accessToken:this.token({sub:user.id,role:user.role}),user:{id:user.id,email:user.email,role:user.role}}; }
}
