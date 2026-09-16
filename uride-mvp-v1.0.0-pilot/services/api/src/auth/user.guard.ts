import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

function jwtSecret(){
  const secret=process.env.JWT_ACCESS_SECRET;
  if(!secret || secret.length<32) throw new UnauthorizedException('Server authentication is not configured');
  return secret;
}

@Injectable()
export class UserGuard implements CanActivate {
  canActivate(context:ExecutionContext){
    const req=context.switchToHttp().getRequest();
    const raw=String(req.headers?.authorization||'');
    const token=raw.startsWith('Bearer ')?raw.slice(7):'';
    const parts=token.split('.');
    if(parts.length!==3) throw new UnauthorizedException('Authentication required');
    const [h,p,sig]=parts;
    const expected=createHmac('sha256',jwtSecret()).update(`${h}.${p}`).digest('base64url');
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!timingSafeEqual(a,b)) throw new UnauthorizedException('Invalid token');
    let payload:any;
    try{ payload=JSON.parse(Buffer.from(p,'base64url').toString('utf8')); }catch{ throw new UnauthorizedException('Invalid token'); }
    if(!payload.sub||!payload.role||!payload.exp||payload.exp<Math.floor(Date.now()/1000)) throw new UnauthorizedException('Session expired or invalid');
    req.userId=payload.sub;
    req.userRole=payload.role;
    return true;
  }
}
