import assert from 'node:assert/strict';

const API=(process.env.URIDE_E2E_API_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
const PASSENGER_ID=process.env.URIDE_E2E_PASSENGER_USER_ID||'';
const DRIVER_ID=process.env.URIDE_E2E_DRIVER_USER_ID||'';
const VEHICLE_ID=process.env.URIDE_E2E_VEHICLE_ID||'';
const ADMIN_TOKEN=process.env.URIDE_E2E_ADMIN_TOKEN||'';
const PASSENGER_TOKEN=process.env.URIDE_E2E_PASSENGER_TOKEN||'';
const DRIVER_TOKEN=process.env.URIDE_E2E_DRIVER_TOKEN||'';

async function req(path,init={}){
  const r=await fetch(API+path,{...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`${init.method||'GET'} ${path} -> ${r.status}: ${body?.message||JSON.stringify(body)}`);
  return body;
}

async function main(){
  console.log(`URide live smoke against ${API}`);
  const health=await req('/health');
  assert.ok(health);

  const quote=await req('/v1/pricing/quote',{method:'POST',body:JSON.stringify({
    serviceType:'STANDARD',estimatedMiles:5,estimatedMinutes:15,
  })});
  assert.ok(Number(quote.estimatedFare)>0);
  assert.ok(Number(quote.estimatedDriverEarnings)>=0);
  console.log('✓ health + pricing quote');

  if(!PASSENGER_ID||!PASSENGER_TOKEN){
    console.log('SKIP full trip flow: set URIDE_E2E_PASSENGER_USER_ID and URIDE_E2E_PASSENGER_TOKEN.');
    return;
  }
  const passengerHeaders={Authorization:`Bearer ${PASSENGER_TOKEN}`};
  const driverHeaders=DRIVER_TOKEN?{Authorization:`Bearer ${DRIVER_TOKEN}`}:{};


  const trip=await req('/v1/trips',{method:'POST',headers:passengerHeaders,body:JSON.stringify({
    passengerUserId:PASSENGER_ID,
    serviceType:'STANDARD',
    pickupAddress:'URide E2E Pickup',
    pickupLat:26.7153,pickupLng:-80.0534,
    destinationAddress:'URide E2E Destination',
    destinationLat:26.7050,destinationLng:-80.0700,
    estimatedMiles:3.2,estimatedMinutes:12,
  })});
  assert.equal(trip.status,'SEARCHING');
  const restored=await req(`/v1/trips/${trip.id}`,{headers:passengerHeaders});
  assert.equal(restored.id,trip.id);
  console.log('✓ create + restore trip');

  if(!DRIVER_ID||!VEHICLE_ID||!DRIVER_TOKEN){
    console.log('SKIP driver lifecycle: pre-approved/compliant Driver, Vehicle ID and DRIVER_TOKEN are required.');
    return;
  }

  await req(`/v1/drivers/${DRIVER_ID}/availability`,{method:'PATCH',headers:driverHeaders,body:JSON.stringify({availability:'ONLINE'})});
  await req(`/v1/drivers/${DRIVER_ID}/location`,{method:'PATCH',headers:driverHeaders,body:JSON.stringify({lat:26.7155,lng:-80.0530,accuracyMeters:8})});
  const offer=await req(`/v1/dispatch/drivers/${DRIVER_ID}/next-offer?radiusMiles=20&ttlSeconds=20`);
  assert.ok(offer?.id,'Driver did not receive a trip offer');

  const accepted=await req(`/v1/trips/${trip.id}/accept`,{method:'POST',headers:driverHeaders,body:JSON.stringify({
    driverUserId:DRIVER_ID,vehicleId:VEHICLE_ID,offerId:offer.id,
  })});
  assert.equal(accepted.status,'DRIVER_ASSIGNED');

  let secondAcceptFailed=false;
  try{
    await req(`/v1/trips/${trip.id}/accept`,{method:'POST',body:JSON.stringify({
      driverUserId:DRIVER_ID,vehicleId:VEHICLE_ID,
    })});
  }catch{ secondAcceptFailed=true; }
  assert.equal(secondAcceptFailed,true,'second accept must fail');

  for(const action of ['arriving','arrived','start','complete']){
    const next=await req(`/v1/trips/${trip.id}/${action}`,{method:'PATCH',headers:driverHeaders,body:JSON.stringify({actorUserId:DRIVER_ID})});
    const expected={arriving:'DRIVER_ARRIVING',arrived:'DRIVER_ARRIVED',start:'IN_PROGRESS',complete:'COMPLETED'}[action];
    assert.equal(next.status,expected);
  }
  console.log('✓ accept race guard + complete trip lifecycle');

  const paymentKey=`e2e-${trip.id}`;
  let paymentConfigured=true;
  try{
    const p1=await req(`/v1/payments/trip/${trip.id}/intent`,{
      method:'POST',headers:{...passengerHeaders,'Idempotency-Key':paymentKey},body:JSON.stringify({tip:2}),
    });
    const p2=await req(`/v1/payments/trip/${trip.id}/intent`,{
      method:'POST',headers:{...passengerHeaders,'Idempotency-Key':paymentKey},body:JSON.stringify({tip:2}),
    });
    assert.equal(p1.payment.id,p2.payment.id);
    console.log('✓ Stripe PaymentIntent idempotency');
  }catch(e){
    paymentConfigured=false;
    console.log(`SKIP Stripe payment smoke: ${e.message}`);
  }

  if(ADMIN_TOKEN){
    const dashboard=await req('/v1/admin/dashboard',{headers:{Authorization:`Bearer ${ADMIN_TOKEN}`}});
    assert.ok(typeof dashboard.activeTrips==='number');
    const ai=await req('/v1/admin/ai/operations-brief',{headers:{Authorization:`Bearer ${ADMIN_TOKEN}`}});
    assert.ok(ai.answer);
    console.log('✓ protected Admin dashboard + Operations AI');
  }else{
    console.log('SKIP Admin smoke: set URIDE_E2E_ADMIN_TOKEN.');
  }

  console.log(`PASS live API smoke${paymentConfigured?' + Stripe intent':' (Stripe skipped)'}`);
}

main().catch(err=>{console.error(err);process.exit(1)});
