// Fleet vehicle data types
export interface Vehicle {
  id: string;
  name: string;
  plateNumber: string;
  mileage: number;
  status: 'Active' | 'In Service' | 'Out of Service' | 'Maintenance';
  lastService: string;
  nextService: string;
  fuelEfficiency: number;
  utilizationRate: number;
}

// Chart data types
export interface UtilizationData {
  month: string;
  utilization: number;
  vehicles: number;
}

export interface ServiceData {
  vehicleId: string;
  vehicleName: string;
  serviceType: string;
  date: string;
  cost: number;
  status: 'Completed' | 'Scheduled' | 'In Progress';
}
