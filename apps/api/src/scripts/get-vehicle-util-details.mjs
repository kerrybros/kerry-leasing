/**
 * GET VEHICLE UTILIZATION DETAILS FOR VERIFICATION
 */

import axios from 'axios';

const API_KEY = '11dca31e-79b0-4351-9684-9ae465a3b5ce';
const BASE_URL = 'https://api.gomotive.com';

async function getVehicleUtilization() {
  console.log(`\n📊 VEHICLE UTILIZATION - February 2, 2026\n`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const response = await axios.get(`${BASE_URL}/v2/vehicle_utilization`, {
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

    const vehicles = response.data.vehicle_utilizations;
    
    console.log(`Total Vehicles: ${response.data.pagination.total}`);
    console.log(`Showing: ${vehicles.length} of ${response.data.pagination.total}\n`);
    console.log(`${'='.repeat(80)}\n`);

    vehicles.forEach((item, index) => {
      const v = item.vehicle_utilization;
      console.log(`${index + 1}. Vehicle #${v.vehicle.number} (VIN: ${v.vehicle.vin || 'N/A'})`);
      console.log(`   Vehicle ID: ${v.vehicle.id}`);
      console.log(`   Utilization: ${v.utilization_percentage}%`);
      console.log(`   Idle Time: ${v.idle_time} seconds (${(v.idle_time / 3600).toFixed(2)} hours)`);
      console.log(`   Driving Time: ${v.driving_time} seconds (${(v.driving_time / 3600).toFixed(2)} hours)`);
      console.log(`   Total Distance: ${v.total_distance.toFixed(2)} miles`);
      console.log(`   Idle Fuel: ${v.idle_fuel.toFixed(2)} gallons`);
      console.log(`   Driving Fuel: ${v.driving_fuel.toFixed(2)} gallons`);
      console.log(`   Total Fuel: ${v.total_fuel.toFixed(2)} gallons`);
      console.log(`   Last Located: ${v.last_located_at || 'N/A'}`);
      if (v.message) console.log(`   Message: ${v.message}`);
      console.log('');
    });

    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

getVehicleUtilization();
