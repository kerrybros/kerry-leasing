import { Vehicle, UtilizationData } from './types';

// TODO: Replace with actual API calls to fetch fleet data from database
export const mockVehicles: Vehicle[] = [
  {
    id: 'FL-001',
    name: 'Freightliner Cascadia',
    plateNumber: 'FL-001',
    mileage: 125450,
    status: 'Active',
    lastService: '2024-09-15',
    nextService: '2024-12-15',
    fuelEfficiency: 7.2,
    utilizationRate: 85
  },
  {
    id: 'TR-105',
    name: 'Volvo VNL 760',
    plateNumber: 'TR-105',
    mileage: 89230,
    status: 'In Service',
    lastService: '2024-10-01',
    nextService: '2024-10-15',
    fuelEfficiency: 6.8,
    utilizationRate: 0
  },
  {
    id: 'DL-023',
    name: 'Peterbilt 579',
    plateNumber: 'DL-023',
    mileage: 156780,
    status: 'Active',
    lastService: '2024-08-20',
    nextService: '2024-11-20',
    fuelEfficiency: 6.5,
    utilizationRate: 92
  },
  {
    id: 'KW-087',
    name: 'Kenworth T680',
    plateNumber: 'KW-087',
    mileage: 67890,
    status: 'Active',
    lastService: '2024-09-30',
    nextService: '2024-12-30',
    fuelEfficiency: 7.5,
    utilizationRate: 78
  },
  {
    id: 'MC-156',
    name: 'Mack Anthem',
    plateNumber: 'MC-156',
    mileage: 203450,
    status: 'Maintenance',
    lastService: '2024-10-05',
    nextService: '2024-10-12',
    fuelEfficiency: 6.2,
    utilizationRate: 0
  },
  {
    id: 'IT-234',
    name: 'International LT',
    plateNumber: 'IT-234',
    mileage: 98765,
    status: 'Active',
    lastService: '2024-09-10',
    nextService: '2024-12-10',
    fuelEfficiency: 6.9,
    utilizationRate: 88
  }
];

// TODO: Replace with actual API calls to fetch utilization data from analytics service
export const mockUtilizationData: UtilizationData[] = [
  { month: 'Jan', utilization: 82, vehicles: 22 },
  { month: 'Feb', utilization: 85, vehicles: 23 },
  { month: 'Mar', utilization: 78, vehicles: 23 },
  { month: 'Apr', utilization: 91, vehicles: 24 },
  { month: 'May', utilization: 87, vehicles: 24 },
  { month: 'Jun', utilization: 89, vehicles: 24 },
  { month: 'Jul', utilization: 93, vehicles: 24 },
  { month: 'Aug', utilization: 88, vehicles: 24 },
  { month: 'Sep', utilization: 86, vehicles: 24 },
  { month: 'Oct', utilization: 84, vehicles: 24 }
];

export function getStatusColor(status: Vehicle['status']): string {
  switch (status) {
    case 'Active':
      return 'text-green-600 bg-green-100';
    case 'In Service':
      return 'text-yellow-600 bg-yellow-100';
    case 'Maintenance':
      return 'text-orange-600 bg-orange-100';
    case 'Out of Service':
      return 'text-red-600 bg-red-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}
