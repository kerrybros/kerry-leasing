/**
 * Get detailed Idle Events records for verification
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

async function getIdleEventsDetails() {
  console.log('\n=== Idle Events for February 2, 2026 ===\n');

  const testDate = '2026-02-02';

  try {
    const response = await makeMotiveRequest('/v1/idle_events', {
      start_date: testDate,
      end_date: testDate
    });

    const records = response.idle_events || [];
    
    console.log(`✓ API Response received\n`);
    console.log(`Total idle events: ${response.pagination?.total || records.length}`);
    console.log(`Records in first page: ${records.length}\n`);

    if (records.length > 0) {
      console.log('=== Top 10 Idle Events ===\n');
      
      const topEvents = records.slice(0, 10);
      
      topEvents.forEach((item, index) => {
        const e = item.idle_event;
        console.log(`${index + 1}. Event ID: ${e.id}`);
        console.log(`   Driver: ${e.driver?.first_name || 'N/A'} ${e.driver?.last_name || ''} (ID: ${e.driver?.id || 'N/A'})`);
        console.log(`   Vehicle: ${e.vehicle?.number || 'N/A'} - VIN: ${e.vehicle?.vin || 'N/A'}`);
        console.log(`   Start Time: ${e.start_time}`);
        console.log(`   End Time: ${e.end_time}`);
        
        // Calculate duration in minutes
        if (e.start_time && e.end_time) {
          const start = new Date(e.start_time);
          const end = new Date(e.end_time);
          const durationMinutes = (end - start) / 60000;
          console.log(`   Duration: ${durationMinutes.toFixed(2)} minutes`);
        }
        
        console.log(`   Fuel Start: ${e.veh_fuel_start?.toFixed(2)} ml`);
        console.log(`   Fuel End: ${e.veh_fuel_end?.toFixed(2)} ml`);
        
        if (e.veh_fuel_start && e.veh_fuel_end) {
          const fuelUsedMl = e.veh_fuel_end - e.veh_fuel_start;
          const fuelUsedGal = fuelUsedMl / 3785.41; // ml to gallons
          console.log(`   Fuel Used: ${fuelUsedGal.toFixed(3)} gallons`);
        }
        
        console.log(`   Location: ${e.city || 'N/A'}, ${e.state || 'N/A'}`);
        console.log(`   Coordinates: ${e.lat?.toFixed(6)}, ${e.lon?.toFixed(6)}`);
        console.log(`   End Type: ${e.end_type || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('No idle events found.');
    }

  } catch (error) {
    console.error('✗ Error fetching idle events:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await getIdleEventsDetails();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
