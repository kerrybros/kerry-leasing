/**
 * Get detailed Driving Periods records for verification
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

async function getDrivingPeriodsDetails() {
  console.log('\n=== Driving Periods for February 2, 2026 ===\n');

  const testDate = '2026-02-02';

  try {
    const response = await makeMotiveRequest('/v1/driving_periods', {
      start_date: testDate,
      end_date: testDate
    });

    const records = response.driving_periods || [];
    
    console.log(`✓ API Response received\n`);
    console.log(`Total driving periods: ${response.pagination?.total || records.length}`);
    console.log(`Records in first page: ${records.length}\n`);

    if (records.length > 0) {
      console.log('=== Top 10 Driving Periods ===\n');
      
      const topPeriods = records.slice(0, 10);
      
      topPeriods.forEach((item, index) => {
        const p = item.driving_period;
        console.log(`${index + 1}. Period ID: ${p.id}`);
        console.log(`   Driver: ${p.driver?.first_name || 'N/A'} ${p.driver?.last_name || ''} (ID: ${p.driver?.id || 'N/A'})`);
        console.log(`   Vehicle: ${p.vehicle?.number || 'N/A'} - VIN: ${p.vehicle?.vin || 'N/A'}`);
        console.log(`   Start Time: ${p.start_time}`);
        console.log(`   End Time: ${p.end_time || 'In Progress'}`);
        console.log(`   Status: ${p.status} | Type: ${p.type}`);
        
        if (p.duration) {
          console.log(`   Duration: ${(p.duration / 3600).toFixed(2)} hours`);
        }
        
        // Calculate distance
        if (p.start_kilometers && p.end_kilometers) {
          const distanceKm = p.end_kilometers - p.start_kilometers;
          const distanceMiles = distanceKm * 0.621371;
          console.log(`   Distance: ${distanceMiles.toFixed(2)} miles (${distanceKm.toFixed(2)} km)`);
        } else if (p.distance) {
          console.log(`   Distance: ${p.distance}`);
        }
        
        if (p.origin) {
          console.log(`   Origin: ${p.origin}`);
        }
        if (p.destination) {
          console.log(`   Destination: ${p.destination}`);
        }
        
        console.log('');
      });
    } else {
      console.log('No driving periods found.');
    }

  } catch (error) {
    console.error('✗ Error fetching driving periods:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await getDrivingPeriodsDetails();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
