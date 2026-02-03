/**
 * Test Driving Periods endpoint with different parameter formats
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

async function testDrivingPeriods() {
  console.log('\n=== Testing Driving Periods Endpoint ===\n');

  const testDate = '2026-02-02';

  // Test different parameter formats
  const formats = [
    {
      name: 'start_date/end_date',
      params: { start_date: testDate, end_date: testDate }
    },
    {
      name: 'start_at/end_at with ISO timestamps',
      params: { start_at: `${testDate}T00:00:00Z`, end_at: `${testDate}T23:59:59Z` }
    },
    {
      name: 'start_time/end_time',
      params: { start_time: testDate, end_time: testDate }
    }
  ];

  for (const format of formats) {
    console.log(`\nTesting format: ${format.name}`);
    console.log(`Parameters:`, format.params);
    
    try {
      const response = await makeMotiveRequest('/v1/driving_periods', format.params);
      
      console.log('✓ Success!');
      console.log('Response keys:', Object.keys(response));
      
      // Find the data array
      const dataKey = Object.keys(response).find(key => 
        Array.isArray(response[key]) && key !== 'pagination'
      );
      
      const records = dataKey ? response[dataKey] : [];
      console.log(`Records found: ${records.length}`);
      
      if (response.pagination) {
        console.log(`Total records: ${response.pagination.total}`);
      }
      
      if (records.length > 0) {
        console.log('\n✓✓✓ THIS FORMAT WORKS! ✓✓✓');
        console.log(`\nFirst record sample:`, JSON.stringify(records[0], null, 2).substring(0, 600));
        break; // Found working format
      }
      
    } catch (error) {
      console.log('✗ Failed:', error.message);
    }
    
    // Wait between attempts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function main() {
  try {
    await testDrivingPeriods();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
