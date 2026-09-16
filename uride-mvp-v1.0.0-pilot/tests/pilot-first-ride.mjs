import assert from 'node:assert/strict';

const API=(process.env.URIDE_E2E_API_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
const passengerEmail=process.env.PILOT_PASSENGER_EMAIL||'passenger.pilot@uride.local';
const passengerPassword=process.env.PILOT_PASSENGER_PASSWORD||'';
const driverEmail=process.env.PILOT_DRIVER_EMAIL||'driver.pilot@uride.local';
const driverPassword=process.env.PILOT_DRIVER_PASSWORD||'';

if(!passengerPassword||!driverPassword){
  console.error('Set PILOT_PASSENGER_PASSWORD and PILOT_DRIVER_PASSWORD.');
  process.exit(2);
}

async function req(path,init={}){
  const r=await fetch(API+path,{...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`${init.method||'GET'} ${path} -> ${r.status}: ${body?.message||JSON.stringify(body)}`);
  return body;
}
const auth=(token)=>({Authorization:`Bearer ${token}`});

async function login(email,password){
  return req('/v1/auth/login',{method:'POST',body:JSON.stringify({email,password})});
}

async function main(){
  console.log(`URide first ride smoke: ${API}`);

  const passenger=await login(passengerEmail,passengerPassword);
  const driver=await login(driverEmail,driverPassword);
  assert.equal(passenger.user.role,'PASSENGER');
  assert.equal(driver.user.role,'DRIVER');

  const ph=auth(passenger.accessToken),dh=auth(driver.accessToken);
  const driverProfile=await req(`/v1/users/${driver.user.id}/profile`,{headers:dh});
  const vehicle=driverProfile.driverProfile?.vehicles?.find(v=>v.status==='APPROVED');
  assert.ok(vehicle,'Pilot Driver needs an APPROVED vehicle');

  await req(`/v1/drivers/${driver.user.id}/availability`,{
    method:'PATCH',headers:dh,body:JSON.stringify({availability:'ONLINE'}),
  });
  await req(`/v1/drivers/${driver.user.id}/location`,{
    method:'PATCH',headers:dh,body:JSON.stringify({lat:26.7155,lng:-80.0530,accuracyMeters:8}),
  });

  const trip=await req('/v1/trips',{
    method:'POST',headers:ph,body:JSON.stringify({
      serviceType:'STANDARD',
      pickupAddress:'URide Pilot Pickup',
      pickupLat:26.7153,pickupLng:-80.0534,
      destinationAddress:'URide Pilot Destination',
      destinationLat:26.7050,destinationLng:-80.0700,
      estimatedMiles:3.2,estimatedMinutes:12,
    }),
  });
  assert.equal(trip.status,'SEARCHING');
  console.log(`✓ trip created ${trip.id}`);

  const offer=await req(`/v1/dispatch/drivers/${driver.user.id}/next-offer?radiusMiles=20&ttlSeconds=30`,{headers:dh});
  assert.ok(offer?.id,'No dispatch offer returned');
  console.log(`✓ offer ${offer.id}`);

  const accepted=await req(`/v1/trips/${trip.id}/accept`,{
    method:'POST',headers:dh,body:JSON.stringify({vehicleId:vehicle.id,offerId:offer.id}),
  });
  assert.equal(accepted.status,'DRIVER_ASSIGNED');
  console.log('✓ Driver accepted');

  await req(`/v1/trips/${trip.id}/arriving`,{method:'PATCH',headers:dh,body:'{}'});
  await req(`/v1/trips/${trip.id}/arrived`,{method:'PATCH',headers:dh,body:'{}'});
  await req(`/v1/trips/${trip.id}/start`,{method:'PATCH',headers:dh,body:'{}'});
  console.log('✓ trip started');

  const changed=await req(`/v1/trips/${trip.id}/destination`,{
    method:'PATCH',headers:ph,body:JSON.stringify({
      destinationAddress:'URide Pilot Updated Destination',
      destinationLat:26.7000,destinationLng:-80.0750,
      estimatedMiles:4.1,estimatedMinutes:16,
    }),
  });
  assert.equal(changed.destinationAddress,'URide Pilot Updated Destination');
  console.log('✓ destination changed');

  const completed=await req(`/v1/trips/${trip.id}/complete`,{method:'PATCH',headers:dh,body:'{}'});
  assert.equal(completed.status,'COMPLETED');

  const restored=await req(`/v1/trips/${trip.id}`,{headers:ph});
  assert.equal(restored.status,'COMPLETED');
  console.log('✓ trip completed and restored');

  console.log(JSON.stringify({
    result:'PASS',
    tripId:trip.id,
    passengerUserId:passenger.user.id,
    driverUserId:driver.user.id,
    vehicleId:vehicle.id,
    finalStatus:restored.status,
    finalFare:Number(restored.finalFare||restored.estimatedFare),
  },null,2));
}

main().catch(err=>{console.error(err);process.exit(1)});
