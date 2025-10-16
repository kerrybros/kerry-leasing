// Customer configuration types
export interface CustomerConfig {
  // Basic Info
  id: string
  name: string
  slug: string // URL-friendly identifier
  logo?: string
  
  // Branding
  branding: {
    primaryColor: string
    secondaryColor: string
    logoUrl?: string
    companyName: string
  }
  
  // Data Sources
  dataSources: {
    fleetCsvUrl: string
    maintenanceCsvUrl: string
    serviceRequestsCsvUrl?: string
  }
  
  // Service Integration
  serviceRequest: {
    enabled: boolean
    type: 'external_link' | 'form' | 'email' | 'api'
    config: {
      // For external_link
      url?: string
      // For email
      email?: string
      subject?: string
      // For form
      formFields?: Array<{
        name: string
        type: string
        required: boolean
        label: string
      }>
      // For API
      apiEndpoint?: string
      apiKey?: string
    }
  }
  
  // Features & Permissions
  features: {
    fleetOverview: boolean
    maintenance: boolean
    reports: boolean
    analytics: boolean
    serviceRequests: boolean
    realTimeTracking?: boolean
  }
  
  // Contact Info
  contact: {
    supportEmail: string
    supportPhone?: string
    emergencyContact?: string
  }
  
  // Custom Fields (for CSV filtering)
  dataMapping: {
    customerIdentifier: string // Column name that identifies this customer's data
    customerValue: string // The value to filter by
    vehicleIdColumn?: string
    statusColumn?: string
    dateColumns?: {
      lastService?: string
      nextService?: string
    }
  }
}

// Example customer configs
export const customerConfigs: Record<string, CustomerConfig> = {
  'wolverine': {
    id: 'wolverine',
    name: 'Wolverine Packing',
    slug: 'wolverine',
    branding: {
      primaryColor: '#1f2937', // gray-800
      secondaryColor: '#374151', // gray-700
      companyName: 'Wolverine Packing',
      logoUrl: '/Kerry Leasing with background.png'
    },
    dataSources: {
      fleetCsvUrl: '/data/wolverine-fleet.csv',
      maintenanceCsvUrl: '/data/wolverine-maintenance.csv'
    },
    serviceRequest: {
      enabled: true,
      type: 'external_link',
      config: {
        url: 'https://app.fullbay.com/xydYqBo3ihcqhWcSiK3iuJZr5zmvUA8q$Wi5BYmAn8BmVOc84kgrcTjg9kNfrl1R'
      }
    },
    features: {
      fleetOverview: true,
      maintenance: true,
      reports: true,
      analytics: true,
      serviceRequests: true
    },
    contact: {
      supportEmail: 'support@wolverinepacking.com',
      supportPhone: '555-WOLVERINE'
    },
    dataMapping: {
      customerIdentifier: 'customer_name',
      customerValue: 'Wolverine Packing',
      vehicleIdColumn: 'unit_number',
      statusColumn: 'status',
      dateColumns: {
        lastService: 'last_service_date',
        nextService: 'next_service_date'
      }
    }
  },

  'kerry-brothers': {
    id: 'kerry-brothers',
    name: 'Kerry Brothers Truck Repair',
    slug: 'kerry-brothers',
    branding: {
      primaryColor: '#2563eb', // blue-600
      secondaryColor: '#3b82f6', // blue-500
      companyName: 'Kerry Brothers Truck Repair',
      logoUrl: '/Kerry Leasing with background.png'
    },
    dataSources: {
      fleetCsvUrl: '/data/kerry-fleet.csv',
      maintenanceCsvUrl: '/data/kerry-maintenance.csv'
    },
    serviceRequest: {
      enabled: true,
      type: 'external_link',
      config: {
        url: 'https://app.fullbay.com/xydYqBo3ihcqhWcSiK3iuJZr5zmvUA8q$Wi5BYmAn8BmVOc84kgrcTjg9kNfrl1R'
      }
    },
    features: {
      fleetOverview: true,
      maintenance: true,
      reports: true,
      analytics: true,
      serviceRequests: true
    },
    contact: {
      supportEmail: 'support@kerrybrotherstruckrepair.com',
      supportPhone: '555-KERRY'
    },
    dataMapping: {
      customerIdentifier: 'customer_name',
      customerValue: 'Kerry Brothers',
      vehicleIdColumn: 'vehicle_id',
      statusColumn: 'status',
      dateColumns: {
        lastService: 'last_service_date',
        nextService: 'next_service_date'
      }
    }
  },

  'abc-trucking': {
    id: 'abc-trucking',
    name: 'ABC Trucking Company',
    slug: 'abc-trucking',
    branding: {
      primaryColor: '#1e40af', // blue-800
      secondaryColor: '#3b82f6', // blue-500
      companyName: 'ABC Trucking',
      logoUrl: '/logos/abc-trucking.png'
    },
    dataSources: {
      fleetCsvUrl: '/data/master-fleet.csv',
      maintenanceCsvUrl: '/data/master-maintenance.csv'
    },
    serviceRequest: {
      enabled: true,
      type: 'external_link',
      config: {
        url: 'https://abc-trucking.servicedesk.com/new-request'
      }
    },
    features: {
      fleetOverview: true,
      maintenance: true,
      reports: true,
      analytics: false,
      serviceRequests: true
    },
    contact: {
      supportEmail: 'support@abc-trucking.com',
      supportPhone: '555-0123'
    },
    dataMapping: {
      customerIdentifier: 'company_name',
      customerValue: 'ABC Trucking Company',
      vehicleIdColumn: 'vehicle_id',
      statusColumn: 'status'
    }
  },
  
  'xyz-logistics': {
    id: 'xyz-logistics',
    name: 'XYZ Logistics',
    slug: 'xyz-logistics',
    branding: {
      primaryColor: '#059669', // emerald-600
      secondaryColor: '#10b981', // emerald-500
      companyName: 'XYZ Logistics',
      logoUrl: '/logos/xyz-logistics.png'
    },
    dataSources: {
      fleetCsvUrl: '/data/master-fleet.csv',
      maintenanceCsvUrl: '/data/master-maintenance.csv'
    },
    serviceRequest: {
      enabled: true,
      type: 'email',
      config: {
        email: 'maintenance@xyz-logistics.com',
        subject: 'Service Request - Vehicle #{vehicleId}'
      }
    },
    features: {
      fleetOverview: true,
      maintenance: true,
      reports: true,
      analytics: true,
      serviceRequests: true,
      realTimeTracking: true
    },
    contact: {
      supportEmail: 'support@xyz-logistics.com',
      emergencyContact: '555-EMERGENCY'
    },
    dataMapping: {
      customerIdentifier: 'customer_id',
      customerValue: 'XYZ001',
      vehicleIdColumn: 'truck_number',
      statusColumn: 'current_status',
      dateColumns: {
        lastService: 'last_maintenance_date',
        nextService: 'next_due_date'
      }
    }
  }
}
