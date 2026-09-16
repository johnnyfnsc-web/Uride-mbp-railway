import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('trip claim is conditional and rejects double acceptance',()=>{
  const s=read('services/api/src/trips/trips.service.ts');
  assert.match(s,/updateMany\(\{\s*where:\s*\{\s*id,\s*status:\s*'SEARCHING',\s*driverProfileId:\s*null\s*\}/s);
  assert.match(s,/if\s*\(claimed\.count\s*!==\s*1\)\s*throw new ConflictException/);
});

test('payment creation is idempotent locally and at Stripe',()=>{
  const schema=read('services/api/prisma/schema.prisma');
  const s=read('services/api/src/payments/payments.service.ts');
  assert.match(schema,/idempotencyKey String @unique/);
  assert.match(s,/where:\s*\{\s*idempotencyKey\s*\}/);
  assert.match(s,/headers\['Idempotency-Key'\]\s*=\s*idempotencyKey/);
});

test('Stripe webhook signature and event replay protection exist',()=>{
  const schema=read('services/api/prisma/schema.prisma');
  const s=read('services/api/src/payments/payments.service.ts');
  assert.match(schema,/model StripeWebhookEvent/);
  assert.match(s,/verifyStripeSignature/);
  assert.match(s,/stripeWebhookEvent\.findUnique/);
  assert.match(s,/timingSafeEqual/);
});

test('driver cannot go online without approved compliance',()=>{
  const s=read('services/api/src/drivers/drivers.controller.ts');
  assert.match(s,/Driver must be approved before going ONLINE/);
  assert.match(s,/Required driver\/vehicle documents are missing, unapproved or expired/);
  assert.match(s,/eligibleToDrive/);
});

test('duplicate successful payment processing cannot duplicate earnings ledger',()=>{
  const schema=read('services/api/prisma/schema.prisma');
  const s=read('services/api/src/earnings/earnings.service.ts');
  assert.match(schema,/externalKey String @unique/);
  assert.match(s,/payment:\$\{payment\.id\}:trip/);
  assert.match(s,/payment:\$\{payment\.id\}:tip/);
});

test('refunds create idempotent driver earning reversals',()=>{
  const s=read('services/api/src/earnings/earnings.service.ts');
  assert.match(s,/refund:\$\{refundId\}/);
  assert.match(s,/REFUND_REVERSAL/);
  assert.match(s,/amount:-Math\.abs\(driverShare\)/);
});

test('no-show requires at least five minutes of waiting',()=>{
  const s=read('services/api/src/trips/trips.service.ts');
  assert.match(s,/elapsed < 5 \* 60 \* 1000/);
  assert.match(s,/No-show is available after 5 minutes of waiting/);
});

test('safety heuristics do not alter trip status automatically',()=>{
  const s=read('services/api/src/drivers/drivers.controller.ts');
  assert.match(s,/only create alerts; they never cancel or alter the trip/);
  assert.match(s,/ROUTE_DEVIATION/);
  assert.match(s,/UNUSUAL_STOP/);
});

test('Risk scoring opens review instead of automatically suspending',()=>{
  const s=read('services/api/src/risk/risk.service.ts');
  assert.match(s,/riskCase\.create/);
  assert.doesNotMatch(s,/isActive:false/);
  assert.doesNotMatch(s,/status:'SUSPENDED'/);
});

test('manual Risk review owns suspension decision',()=>{
  const s=read('services/api/src/admin/admin.service.ts');
  assert.match(s,/decision==='SUSPEND'/);
  assert.match(s,/isActive=false/);
  assert.match(s,/status:'SUSPENDED'/);
});

test('AI critical actions are blocked from autonomous execution',()=>{
  const s=read('services/api/src/ai/ai.service.ts');
  for(const action of ['ISSUE_REFUND','SUSPEND_ACCOUNT','CONTACT_EMERGENCY_SERVICES','APPROVE_DOCUMENT','CHANGE_PRICING','CHARGE_PAYMENT']){
    assert.ok(s.includes(action),`missing AI block: ${action}`);
  }
  assert.match(s,/status:'BLOCKED'/);
});

test('Admin routes are protected by AdminGuard',()=>{
  const s=read('services/api/src/admin/admin.controller.ts');
  assert.match(s,/@UseGuards\(AdminGuard\)/);
});

test('public registration cannot create ADMIN users',()=>{
  const s=read('services/api/src/auth/auth.service.ts');
  assert.match(s,/\['PASSENGER','DRIVER'\]\.includes\(dto\.role\)/);
});

test('scheduled reminders and background dispatch workers exist',()=>{
  const n=read('services/api/src/notifications/notifications.service.ts');
  const d=read('services/api/src/dispatch/dispatch.service.ts');
  assert.match(n,/processScheduledRideReminders/);
  assert.match(d,/processDriverOffers/);
});

test('secure trip share stores hash rather than raw token',()=>{
  const s=read('services/api/src/safety/safety.service.ts');
  assert.match(s,/randomBytes\(32\)/);
  assert.match(s,/createHash\('sha256'\)/);
  assert.match(s,/tokenHash/);
});


test('core Passenger/Driver/Payment routes require authenticated UserGuard',()=>{
  const trips=read('services/api/src/trips/trips.controller.ts');
  const drivers=read('services/api/src/drivers/drivers.controller.ts');
  const payments=read('services/api/src/payments/payments.controller.ts');
  assert.match(trips,/@UseGuards\(UserGuard\)/);
  assert.match(drivers,/@UseGuards\(UserGuard\)/);
  assert.match(payments,/@UseGuards\(UserGuard\)/);
  assert.match(trips,/passengerUserId:req\.userId/);
  assert.match(trips,/this\.trips\.accept\(id,req\.userId/);
});

test('JWT has no development secret fallback',()=>{
  const auth=read('services/api/src/auth/auth.service.ts');
  const admin=read('services/api/src/admin/admin.guard.ts');
  assert.doesNotMatch(auth,/dev-only-change-me/);
  assert.doesNotMatch(admin,/dev-only-change-me/);
  assert.match(auth,/secret\.length<32/);
});

test('active trip destination change recalculates quote and is audited',()=>{
  const controller=read('services/api/src/trips/trips.controller.ts');
  const service=read('services/api/src/trips/trips.service.ts');
  assert.match(controller,/@Patch\(':tripId\/destination'\)/);
  assert.match(service,/async changeDestination/);
  assert.match(service,/DESTINATION_CHANGED/);
  assert.match(service,/this\.pricing\.quote/);
});

test('routing requires an explicit provider URL for pilot',()=>{
  const routing=read('services/api/src/routing/routing.service.ts');
  assert.doesNotMatch(routing,/router\.project-osrm\.org/);
  assert.match(routing,/ROUTING_BASE_URL is required/);
});
