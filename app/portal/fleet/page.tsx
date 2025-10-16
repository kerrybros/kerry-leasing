'use client';

import { UserButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import Link from 'next/link'
import { mockVehicles, mockUtilizationData, getStatusColor } from '@/lib/data'

export default function FleetPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-2xl font-bold text-gray-900">
                Kerry Leasing
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/portal" className="text-blue-600 hover:text-blue-800">
                Portal
              </Link>
              <span className="text-gray-300">/</span>
              <span className="text-gray-600">Fleet Data</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button asChild variant="outline" size="sm">
                <Link href="/portal">
                  ← Back to Portal
                </Link>
              </Button>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Fleet Data & Analytics</h1>
          <p className="mt-2 text-gray-600">
            Comprehensive view of your fleet vehicles, utilization metrics, and performance data.
          </p>
        </div>

        {/* Fleet Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Fleet</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{mockVehicles.length}</div>
              <p className="text-xs text-gray-500">Vehicles in fleet</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {mockVehicles.filter(v => v.status === 'Active').length}
              </div>
              <p className="text-xs text-gray-500">Currently active</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">In Service</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {mockVehicles.filter(v => v.status === 'In Service').length}
              </div>
              <p className="text-xs text-gray-500">Being serviced</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(mockVehicles.reduce((acc, v) => acc + v.utilizationRate, 0) / mockVehicles.length)}%
              </div>
              <p className="text-xs text-gray-500">Fleet average</p>
            </CardContent>
          </Card>
        </div>

        {/* Fleet Table */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Fleet Vehicles</CardTitle>
            <CardDescription>
              Detailed information about all vehicles in your fleet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Plate Number</TableHead>
                    <TableHead>Mileage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Service</TableHead>
                    <TableHead>Next Service</TableHead>
                    <TableHead>Fuel Efficiency</TableHead>
                    <TableHead>Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockVehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell className="font-medium">{vehicle.name}</TableCell>
                      <TableCell>{vehicle.plateNumber}</TableCell>
                      <TableCell>{vehicle.mileage.toLocaleString()} mi</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(vehicle.status)}`}>
                          {vehicle.status}
                        </span>
                      </TableCell>
                      <TableCell>{new Date(vehicle.lastService).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(vehicle.nextService).toLocaleDateString()}</TableCell>
                      <TableCell>{vehicle.fuelEfficiency} mpg</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${vehicle.utilizationRate}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600">{vehicle.utilizationRate}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Utilization Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Fleet Utilization Trend</CardTitle>
              <CardDescription>
                Monthly utilization rates across your fleet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mockUtilizationData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="utilization" 
                      stroke="#2563eb" 
                      strokeWidth={2}
                      name="Utilization (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Count Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Fleet Size Over Time</CardTitle>
              <CardDescription>
                Number of vehicles in fleet by month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockUtilizationData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar 
                      dataKey="vehicles" 
                      fill="#16a34a" 
                      name="Vehicle Count"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* TODO: Add more analytics sections */}
        {/* Future enhancements could include:
            - Cost analysis charts
            - Maintenance schedule timeline
            - Fuel efficiency trends
            - Route optimization metrics
            - Driver performance data
            - Predictive maintenance alerts
        */}
      </main>
    </div>
  )
}
