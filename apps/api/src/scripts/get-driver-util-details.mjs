/**
 * GET DRIVER UTILIZATION DETAILS FOR VERIFICATION
 */

import axios from 'axios';

const API_KEY = '11dca31e-79b0-4351-9684-9ae465a3b5ce';
const BASE_URL = 'https://api.gomotive.com';

async function getDriverUtilization() {
  console.log(`\n📊 DRIVER UTILIZATION - February 2, 2026\n`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const response = await axios.get(`${BASE_URL}/v2/driver_utilization`, {
      headers: {
        'X-API-Key': API_KEY,
        'X-Time-Zone': 'Eastern Time (US & Canada)',
        'X-Metric-Units': 'false'
      },
      params: {
        start_at: '2026-02-02T00:00:00Z',
        end_at: '2026-02-02T23:59:59Z',
        page: 1,
        per_page: 10
      },
      timeout: 30000
    });

    const drivers = response.data.driver_idle_rollups;
    
    console.log(`Total Drivers: ${response.data.pagination.total}`);
    console.log(`Showing: ${drivers.length} of ${response.data.pagination.total}\n`);
    console.log(`${'='.repeat(80)}\n`);

    drivers.forEach((item, index) => {
      const d = item.driver_idle_rollup;
      const driverName = d.driver?.first_name || d.driver?.last_name 
        ? `${d.driver.first_name || ''} ${d.driver.last_name || ''}`.trim()
        : '(Unknown Driver)';
      
      console.log(`${index + 1}. ${driverName}`);
      console.log(`   Driver ID: ${d.driver?.id || 'N/A'}`);
      console.log(`   Username: ${d.driver?.username || 'N/A'}`);
      console.log(`   Email: ${d.driver?.email || 'N/A'}`);
      console.log(`   Utilization: ${d.utilization?.toFixed(2) || 0}%`);
      console.log(`   Idle Time: ${d.idle_time || 0} seconds (${((d.idle_time || 0) / 3600).toFixed(2)} hours)`);
      console.log(`   Driving Time: ${d.driving_time || 0} seconds (${((d.driving_time || 0) / 3600).toFixed(2)} hours)`);
      console.log(`   Idle Fuel: ${d.idle_fuel?.toFixed(2) || 0} gallons`);
      console.log(`   Driving Fuel: ${d.driving_fuel?.toFixed(2) || 0} gallons`);
      console.log('');
    });

    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

getDriverUtilization();
