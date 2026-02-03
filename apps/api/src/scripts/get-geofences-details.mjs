/**
 * Test Geofences endpoint
 */

import 'dotenv/config';
import https from 'https';

const MOTIVE_API_KEY = '11dca31e-79b0-4351-9684-9ae465a3b5ce';

async function makeMotiveRequest(endpoint, params) {
  return new Promise((resolve, reject) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `https://api.gomotive.com${endpoint}${queryString ? '?' + queryString : ''}`;
    
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

async function getGeofencesDetails() {
  console.log('\n=== Geofences (Configuration Data) ===\n');

  try {
    // Geofences are config data - no date parameters needed
    const response = await makeMotiveRequest('/v1/geofences', {});

    const records = response.geofences || [];
    
    console.log(`✓ API Response received\n`);
    console.log('Response keys:', Object.keys(response));
    console.log(`Total geofences: ${response.pagination?.total || records.length}`);
    console.log(`Records in response: ${records.length}\n`);

    if (records.length > 0) {
      console.log('=== Geofences List ===\n');
      
      records.forEach((item, index) => {
        const g = item.geofence || item;
        console.log(`${index + 1}. Geofence ID: ${g.id}`);
        console.log(`   Name: ${g.name}`);
        console.log(`   Status: ${g.status}`);
        console.log(`   Address: ${g.address || 'N/A'}`);
        console.log(`   Description: ${g.description || 'N/A'}`);
        console.log(`   Category: ${g.category || 'N/A'}`);
        
        if (g.location_points && g.location_points.length > 0) {
          console.log(`   Location Points: ${g.location_points.length} points`);
          console.log(`   First Point: ${g.location_points[0].lat}, ${g.location_points[0].lon}`);
        }
        
        console.log('');
      });
    } else {
      console.log('No geofences found.');
    }

  } catch (error) {
    console.error('✗ Error fetching geofences:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await getGeofencesDetails();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
