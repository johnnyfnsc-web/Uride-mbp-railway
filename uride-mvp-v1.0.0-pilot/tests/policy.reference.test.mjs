import test from 'node:test';
import assert from 'node:assert/strict';

function transition(status,action){
  const map={
    arriving:['DRIVER_ASSIGNED','DRIVER_ARRIVING'],
    arrived:['DRIVER_ARRIVING','DRIVER_ARRIVED'],
    start:['DRIVER_ARRIVED','IN_PROGRESS'],
    complete:['IN_PROGRESS','COMPLETED'],
  };
  const cfg=map[action];
  if(!cfg||status!==cfg[0]) throw new Error('INVALID_TRANSITION');
  return cfg[1];
}
function cancellationFee(status,actor){
  return actor==='PASSENGER'&&['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED'].includes(status)?5:0;
}
function split(subtotal,tip,commissionRate){
  const fee=Math.round(subtotal*commissionRate*100)/100;
  return {platformFee:fee,driverAmount:Math.round((subtotal+tip-fee)*100)/100};
}
function riskLevel(score,{medium=25,high=55,critical=80}={}){
  if(score>=critical)return'CRITICAL';
  if(score>=high)return'HIGH';
  if(score>=medium)return'MEDIUM';
  return'LOW';
}

test('happy-path trip state machine',()=>{
  let s='DRIVER_ASSIGNED';
  s=transition(s,'arriving');
  s=transition(s,'arrived');
  s=transition(s,'start');
  s=transition(s,'complete');
  assert.equal(s,'COMPLETED');
});

test('invalid start before arrival is rejected',()=>{
  assert.throws(()=>transition('DRIVER_ASSIGNED','start'),/INVALID_TRANSITION/);
});

test('passenger cancellation before assignment is free',()=>{
  assert.equal(cancellationFee('SEARCHING','PASSENGER'),0);
});

test('passenger cancellation after assignment has Foundation fee',()=>{
  assert.equal(cancellationFee('DRIVER_ASSIGNED','PASSENGER'),5);
});

test('driver cancellation is waived',()=>{
  assert.equal(cancellationFee('DRIVER_ASSIGNED','DRIVER'),0);
});

test('tip is not included in platform commission',()=>{
  const r=split(20,5,.20);
  assert.deepEqual(r,{platformFee:4,driverAmount:21});
});

test('risk thresholds map deterministically',()=>{
  assert.equal(riskLevel(0),'LOW');
  assert.equal(riskLevel(25),'MEDIUM');
  assert.equal(riskLevel(55),'HIGH');
  assert.equal(riskLevel(80),'CRITICAL');
});
