import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

async function debug() {
  const client = getAppPrisma();
  
  console.log('All client properties:');
  const props = Object.getOwnPropertyNames(client);
  props.forEach(p => console.log(`  ${p}`, typeof client[p]));
  
  console.log('\nAll Object keys:');
  Object.keys(client).forEach(k => console.log(`  ${k}`));
}

debug();
