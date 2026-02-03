/**
 * TEST VEHICLE UTILIZATION TIMESTAMP FORMATS
 * Tests different timestamp formats to find what works
 */

import axios from 'axios';

const API_KEY = '11dca31e-79b0-4351-9684-9ae465a3b5ce';
const BASE_URL = 'https://api.gomotive.com';

async function testFormat(name, params) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`Params:`, params);
  console.log('='.repeat(60));
  
  try {
    const response = await axios.get(`${BASE_URL}/v2/vehicle_utilization`, {
      headers: {
        'X-API-Key': API_KEY,
        'X-Time-Zone': 'Eastern Time (US & Canada)',
        'X-Metric-Units': 'false'
      },
      params,
      timeout: 30000
    });

    console.log(`✅ SUCCESS!`);
    console.log(`Status: ${response.status}`);
    console.log(`Records: ${response.data.vehicle_utilizations?.length || 0}`);
    console.log(`Total: ${response.data.pagination?.total || 0}`);
    console.log(`\nFirst record sample:`);
    if (response.data.vehicle_utilizations?.[0]) {
      const first = response.data.vehicle_utilizations[0].vehicle_utilization;
      console.log(`  Vehicle: ${first.vehicle.number} (${first.vehicle.vin})`);
      console.log(`  Distance: ${first.total_distance} mi`);
      console.log(`  Fuel: ${first.total_fuel} gal`);
    }
    return true;
  } catch (error) {
    console.log(`❌ FAILED`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Error:`, error.response.data);
    } else {
      console.log(`Error:`, error.message);
    }
    return false;
  }
}

async function main() {
  console.log('\n🧪 TESTING VEHICLE UTILIZATION TIMESTAMP FORMATS\n');

  const formats = [
    {
      name: 'Format 1: ISO with Z',
      params: {
        start_at: '2026-02-02T00:00:00Z',
        end_at: '2026-02-02T23:59:59Z',
        page: 1,
        per_page: 10
      }
    },
    {
      name: 'Format 2: ISO without Z',
      params: {
        start_at: '2026-02-02T00:00:00',
        end_at: '2026-02-02T23:59:59',
        page: 1,
        per_page: 10
      }
    },
    {
      name: 'Format 3: With spaces',
      params: {
        start_at: '2026-02-02 00:00:00',
        end_at: '2026-02-02 23:59:59',
        page: 1,
        per_page: 10
      }
    },
    {
      name: 'Format 4: With EST offset',
      params: {
        start_at: '2026-02-02T00:00:00-05:00',
        end_at: '2026-02-02T23:59:59-05:00',
        page: 1,
        per_page: 10
      }
    },
    {
      name: 'Format 5: UTC adjusted for EST',
      params: {
        start_at: '2026-02-02T05:00:00Z',
        end_at: '2026-02-03T04:59:59Z',
        page: 1,
        per_page: 10
      }
    }
  ];

  let workingFormat = null;

  for (const format of formats) {
    const success = await testFormat(format.name, format.params);
    if (success && !workingFormat) {
      workingFormat = format;
    }
    await sleep(1000); // Rate limit
  }

  console.log(`\n${'='.repeat(60)}`);
  if (workingFormat) {
    console.log(`\n✅ WORKING FORMAT FOUND:`);
    console.log(`   ${workingFormat.name}`);
    console.log(`   Params:`, workingFormat.params);
  } else {
    console.log(`\n❌ NO WORKING FORMAT FOUND`);
  }
  console.log(`\n${'='.repeat(60)}\n`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
