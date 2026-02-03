import 'dotenv/config';
import { appPrisma, getAppPrisma } from '../lib/prisma.js';

async function debug() {
  console.log('Testing appPrisma access:');
  
  const client = getAppPrisma();
  console.log('Direct client keys:', Object.keys(client).slice(0, 10));
  console.log('Has motiveVehicleUtilization?', 'motiveVehicleUtilization' in client);
  console.log('Type of motiveVehicleUtilization:', typeof client.motiveVehicleUtilization);
  
  console.log('\nTrying proxy:');
  console.log('appPrisma.motiveVehicleUtilization:', appPrisma.motiveVehicleUtilization);
  console.log('Type:', typeof appPrisma.motiveVehicleUtilization);
  
  if (appPrisma.motiveVehicleUtilization) {
    console.log('findUnique exists?:', typeof appPrisma.motiveVehicleUtilization.findUnique);
  }
}

debug();
