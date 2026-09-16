import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function requirePilotEnv(){
  if(process.env.NODE_ENV!=='production') return;
  const required=['DATABASE_URL','JWT_ACCESS_SECRET','ROUTING_BASE_URL','STRIPE_SECRET_KEY','STRIPE_PUBLISHABLE_KEY','STRIPE_WEBHOOK_SECRET'];
  const missing=required.filter(k=>!process.env[k]?.trim());
  if((process.env.JWT_ACCESS_SECRET||'').length<32) missing.push('JWT_ACCESS_SECRET(>=32 chars)');
  if(missing.length) throw new Error(`URide production configuration missing: ${[...new Set(missing)].join(', ')}`);
}

async function bootstrap(){
  requirePilotEnv();
  const app=await NestFactory.create(AppModule,{rawBody:true});
  app.enableCors({
    origin:process.env.CORS_ORIGINS?process.env.CORS_ORIGINS.split(',').map(x=>x.trim()).filter(Boolean):false,
    credentials:false,
  });
  await app.listen(process.env.PORT??3000);
}
bootstrap();
