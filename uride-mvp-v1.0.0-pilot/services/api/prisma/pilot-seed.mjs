import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma=new PrismaClient();
const hash=(password,salt=randomBytes(16).toString('hex'))=>`${salt}:${scryptSync(password,salt,64).toString('hex')}`;

function required(name){
  const v=process.env[name];
  if(!v) throw new Error(`${name} is required`);
  return v;
}

const passengerEmail=process.env.PILOT_PASSENGER_EMAIL||'passenger.pilot@uride.local';
const driverEmail=process.env.PILOT_DRIVER_EMAIL||'driver.pilot@uride.local';
const adminEmail=process.env.PILOT_ADMIN_EMAIL||'admin.pilot@uride.local';
const passengerPassword=required('PILOT_PASSENGER_PASSWORD');
const driverPassword=required('PILOT_DRIVER_PASSWORD');
const adminPassword=required('PILOT_ADMIN_PASSWORD');

async function upsertUser(email,password,role){
  const existing=await prisma.user.findUnique({where:{email}});
  if(existing) return prisma.user.update({where:{id:existing.id},data:{passwordHash:hash(password),isActive:true}});
  return prisma.user.create({data:{email,passwordHash:hash(password),role,isActive:true}});
}

async function main(){
  const passenger=await upsertUser(passengerEmail,passengerPassword,'PASSENGER');
  await prisma.passengerProfile.upsert({
    where:{userId:passenger.id},
    update:{firstName:'Pilot',lastName:'Passenger',preferredLanguage:'es'},
    create:{userId:passenger.id,firstName:'Pilot',lastName:'Passenger',preferredLanguage:'es'},
  });

  const driverUser=await upsertUser(driverEmail,driverPassword,'DRIVER');
  const driver=await prisma.driverProfile.upsert({
    where:{userId:driverUser.id},
    update:{firstName:'Pilot',lastName:'Driver',preferredLanguage:'es',status:'APPROVED',availability:'OFFLINE'},
    create:{userId:driverUser.id,firstName:'Pilot',lastName:'Driver',preferredLanguage:'es',status:'APPROVED',availability:'OFFLINE'},
  });

  const vehicle=await prisma.vehicle.upsert({
    where:{plate_state:{plate:'URIDE1',state:'FL'}},
    update:{driverProfileId:driver.id,make:'Kia',model:'Pilot',year:2023,color:'Black',status:'APPROVED'},
    create:{driverProfileId:driver.id,make:'Kia',model:'Pilot',year:2023,color:'Black',plate:'URIDE1',state:'FL',status:'APPROVED'},
  });

  const docs=[
    {type:'DRIVER_LICENSE',vehicleId:null,storageKey:'pilot/private/driver-license',documentNumberMasked:'****0001'},
    {type:'VEHICLE_REGISTRATION',vehicleId:vehicle.id,storageKey:'pilot/private/registration',documentNumberMasked:'****0002'},
    {type:'VEHICLE_INSURANCE',vehicleId:vehicle.id,storageKey:'pilot/private/insurance',documentNumberMasked:'****0003'},
  ];
  for(const d of docs){
    const existing=await prisma.driverDocument.findFirst({where:{driverProfileId:driver.id,type:d.type,vehicleId:d.vehicleId}});
    const data={...d,driverProfileId:driver.id,status:'APPROVED',expiresAt:new Date(Date.now()+365*24*60*60*1000),reviewedAt:new Date()};
    if(existing) await prisma.driverDocument.update({where:{id:existing.id},data});
    else await prisma.driverDocument.create({data});
  }

  const admin=await upsertUser(adminEmail,adminPassword,'ADMIN');

  const activeRule=await prisma.pricingRule.findFirst({where:{serviceType:'STANDARD',isActive:true}});
  if(!activeRule){
    await prisma.pricingRule.create({data:{
      serviceType:'STANDARD',baseFare:2.50,perMile:1.65,perMinute:0.28,bookingFee:1.50,minimumFare:7.00,
      platformCommissionRate:0.20,isActive:true,
    }});
  }

  console.log(JSON.stringify({
    passenger:{userId:passenger.id,email:passengerEmail},
    driver:{userId:driverUser.id,driverProfileId:driver.id,email:driverEmail},
    vehicle:{vehicleId:vehicle.id,plate:vehicle.plate,state:vehicle.state},
    admin:{userId:admin.id,email:adminEmail},
  },null,2));
}

main().finally(()=>prisma.$disconnect());
