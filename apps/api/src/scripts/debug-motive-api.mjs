/**
 * DEBUG MOTIVE API RESPONSES
 * Shows the actual raw API response structure for each endpoint
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__filename, '../../.env') });

const API_KEY = '11dca31e-79b0-4351-9684-9ae465a3b5ce';
const BASE_URL = 'https://api.gomotive.com';
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const date = yesterday.toISOString().split('T')[0];

async function testEndpoint(name, url, params = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${name}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`URL: ${url}`);
  console.log(`Params:`, JSON.stringify(params, null, 2));
  
  try {
    const response = await axios.get(`${BASE_URL}${url}`, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      params,
      timeout: 30000
    });

    console.log(`\nStatus: ${response.status}`);
    console.log(`\nResponse structure:`);
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error(`\nERROR:`, error.response?.data || error.message);
  }
}

async function main() {
  console.log(`\n🔍 MOTIVE API RESPONSE STRUCTURE DEBUG`);
  console.log(`Date: ${date}\n`);

  await testEndpoint(
    '1. VEHICLE UTILIZATION',
    '/v2/vehicle_utilization',
    { start_date: date, end_date: date }
  );

  await testEndpoint(
    '2. DRIVER UTILIZATION',
    '/v2/driver_utilization',
    { start_date: date, end_date: date }
  );

  await testEndpoint(
    '3. IDLE EVENTS',
    '/v1/idle_events',
    { start_date: date, end_date: date }
  );

  await testEndpoint(
    '4. DRIVING PERIODS',
    '/v1/driving_periods',
    { start_date: date, end_date: date }
  );

  await testEndpoint(
    '5. GEOFENCES',
    '/v1/geofences',
    {}
  );

  console.log(`\n${'='.repeat(60)}\nDEBUG COMPLETE\n`);
}

main();
