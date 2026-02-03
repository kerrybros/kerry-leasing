/**
 * Test Driver Utilization with start_date and end_date parameters
 */

import 'dotenv/config';
import https from 'https';

const MOTIVE_API_KEY = '11dca31e-79b0-4351-9684-9ae465a3b5ce';

async function makeMotiveRequest(endpoint, params) {
  return new Promise((resolve, reject) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `https://api.gomotive.com${endpoint}?${queryString}`;
    
    const options = {
      headers: {
        'X-API-Key': MOTIVE_API_KEY,
        'Content-Type': 'application/json',
        'X-Time-Zone': 'Eastern Time (US & Canada)',
        'X-Metric-Units': 'false'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function testDriverUtilization() {
  console.log('\n=== Testing Driver Utilization with start_date/end_date ===\n');

  const testDate = '2026-02-02'; // Yesterday

  console.log(`Fetching driver utilization for ${testDate}...`);
  console.log(`Using parameters: start_date=${testDate}, end_date=${testDate}\n`);

  try {
    const response = await makeMotiveRequest('/v2/driver_utilization', {
      start_date: testDate,
      end_date: testDate
    });

    console.log('✓ API Response received\n');
    
    const records = response.driver_idle_rollups || [];
    
    console.log(`Total driver records: ${response.pagination?.total || records.length}`);
    console.log(`Records in response: ${records.length}\n`);

    if (records.length > 0) {
      console.log('=== Top 10 Driver Utilization Records (start_date/end_date) ===\n');
      
      const topDrivers = records.slice(0, 10);
      
      topDrivers.forEach((item, index) => {
        const d = item.driver_idle_rollup;
        const driver = d.driver;
        
        if (!driver) {
          console.log(`${index + 1}. Driver: [No driver assigned]`);
        } else {
          console.log(`${index + 1}. Driver: ${driver.first_name || ''} ${driver.last_name || ''} (ID: ${driver.id})`);
          console.log(`   Username: ${driver.username || 'N/A'}`);
          console.log(`   Email: ${driver.email || 'N/A'}`);
        }
        console.log(`   Utilization: ${d.utilization?.toFixed(2)}%`);
        console.log(`   Driving Time: ${(d.driving_time / 3600).toFixed(2)} hours`);
        console.log(`   Idle Time: ${(d.idle_time / 3600).toFixed(2)} hours`);
        console.log(`   Driving Fuel: ${d.driving_fuel?.toFixed(2)} gallons`);
        console.log(`   Idle Fuel: ${d.idle_fuel?.toFixed(2)} gallons`);
        console.log('');
      });
    } else {
      console.log('No driver utilization records found.');
    }

  } catch (error) {
    console.error('✗ Error fetching driver utilization:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await testDriverUtilization();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
