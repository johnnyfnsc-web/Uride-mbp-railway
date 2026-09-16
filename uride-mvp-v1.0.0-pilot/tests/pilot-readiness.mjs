import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];

function check(name,ok,detail){
  checks.push({name,ok,detail});
  console.log(`${ok?'PASS':'BLOCK'} ${name}${detail?` — ${detail}`:''}`);
}

const env=read('.env.example');
const passenger=read('apps/passenger/app.json');
const driver=read('apps/driver/app.json');
const routing=read('services/api/src/routing/routing.service.ts');
const auth=read('services/api/src/auth/auth.service.ts');
const tripsCtl=read('services/api/src/trips/trips.controller.ts');
const driversCtl=read('services/api/src/drivers/drivers.controller.ts');
const payCtl=read('services/api/src/payments/payments.controller.ts');

check('Stripe keys are not placeholders',
  !env.includes('sk_test_replace_me')&&!env.includes('pk_test_replace_me')&&!env.includes('whsec_replace_me'),
  'pilot needs configured Stripe test/live secrets outside source control');

check('Passenger EAS projectId configured',
  !passenger.includes('REPLACE_WITH_EAS_PROJECT_ID'),
  'required for remote push builds');

check('Driver EAS projectId configured',
  !driver.includes('REPLACE_WITH_EAS_PROJECT_ID'),
  'required for remote push builds');

check('Production routing provider configured',
  !routing.includes('router.project-osrm.org'),
  'public OSRM is development-only for this Foundation');

check('JWT secret has no production fallback',
  !auth.includes("'dev-only-change-me'"),
  'remove development fallback before pilot');

const userAuthGuards =
  tripsCtl.includes('@UseGuards') &&
  driversCtl.includes('@UseGuards') &&
  payCtl.includes('@UseGuards');
check('Passenger/Driver/payment routes enforce authenticated identity',userAuthGuards,
  'core Trips/Drivers/Payments must require UserGuard and derive the acting identity from the token');

check('Reference migrations have been replaced/applied',
  ![...fs.readdirSync(path.join(root,'services/api/prisma/migrations'),{withFileTypes:true})]
    .filter(x=>x.isDirectory())
    .some(x=>{
      const p=path.join(root,'services/api/prisma/migrations',x.name,'migration.sql');
      return fs.existsSync(p)&&fs.readFileSync(p,'utf8').includes('reference migration');
    }),
  'generate/apply real Prisma migrations before pilot');

const blocked=checks.filter(x=>!x.ok);
console.log(`\nPilot gate: ${checks.length-blocked.length}/${checks.length} passed, ${blocked.length} blocker(s).`);
if(blocked.length) process.exit(2);
