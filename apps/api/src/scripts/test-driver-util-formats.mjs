/**
 * TEST DRIVER UTILIZATION FORMATS
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
    const response = await axios.get(`${BASE_URL}/v2/driver_utilization`, {
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
    
    // Check response structure
    console.log(`Response keys:`, Object.keys(response.data));
    
    if (response.data.driver_idle_rollups) {
      console.log(`Records: ${response.data.driver_idle_rollups.length}`);
      console.log(`Total: ${response.data.pagination?.total || 'N/A'}`);
      
      if (response.data.driver_idle_rollups[0]) {
        const first = response.data.driver_idle_rollups[0].driver_idle_rollup;
        console.log(`\nFirst record sample:`);
        console.log(`  Driver: ${first.driver?.first_name || 'N/A'} ${first.driver?.last_name || 'N/A'} (ID: ${first.driver?.id || 'N/A'})`);
        console.log(`  Utilization: ${first.utilization}%`);
        console.log(`  Idle Time: ${first.idle_time}s`);
        console.log(`  Driving Time: ${first.driving_time}s`);
      }
    } else if (response.data.results) {
      console.log(`Records: ${response.data.results.length}`);
    } else {
      console.log(`Response structure:`, JSON.stringify(response.data, null, 2).substring(0, 500));
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
  console.log('\n🧪 TESTING DRIVER UTILIZATION FORMATS\n');

  const formats = [
    {
      name: 'Format 1: start_date/end_date (simple)',
      params: {
        start_date: '2026-02-02',
        end_date: '2026-02-02',
        page: 1,
        per_page: 10
      }
    },
    {
      name: 'Format 2: start_at/end_at with Z',
      params: {
        start_at: '2026-02-02T00:00:00Z',
        end_at: '2026-02-02T23:59:59Z',
        page: 1,
        per_page: 10
      }
    },
    {
      name: 'Format 3: start_at/end_at without Z',
      params: {
        start_at: '2026-02-02T00:00:00',
        end_at: '2026-02-02T23:59:59',
        page: 1,
        per_page: 10
      }
    },
    {
      name: 'Format 4: start_at/end_at with spaces',
      params: {
        start_at: '2026-02-02 00:00:00',
        end_at: '2026-02-02 23:59:59',
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
    await sleep(1000);
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
