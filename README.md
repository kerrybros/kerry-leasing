# 🚛 Kerry Leasing - Fleet Management System

A **production-grade, enterprise-level** fleet management system built with Next.js, featuring comprehensive error handling, performance monitoring, runtime validation, and full accessibility compliance.

## 🎯 **Overview**

This is a **multi-tenant SaaS application** designed for fleet management companies. It provides real-time vehicle tracking, maintenance management, performance analytics, and idle analysis with professional-grade architecture and user experience.

## ✨ **Key Features**

### 🚗 **Fleet Management**
- **Real-time Vehicle Tracking**: Live status and location monitoring
- **Maintenance Management**: Comprehensive repair history and scheduling
- **Performance Analytics**: Fuel efficiency, idle time, and utilization metrics
- **Multi-tenant Architecture**: Isolated data and customizable branding per customer

### 🗺️ **Advanced Analytics**
- **Interactive Mapping**: Mapbox integration with clustering and geofencing
- **Idle Analysis**: Detailed idle event tracking with location-based insights
- **Performance Dashboards**: Comprehensive KPIs and trend analysis
- **Data Visualization**: Charts, graphs, and interactive components

### 🛡️ **Enterprise Features**
- **Comprehensive Error Handling**: Automatic classification, recovery, and reporting
- **Performance Monitoring**: Real-time metrics and threshold-based alerts
- **Runtime Validation**: Type-safe data validation with Zod schemas
- **Advanced Caching**: Multi-level caching with intelligent invalidation
- **Full Accessibility**: WCAG-compliant with screen reader support

## 🏗️ **Architecture**

### **Tech Stack**
- **Frontend**: Next.js 15, React 18, TypeScript
- **Styling**: Tailwind CSS, Radix UI components
- **Authentication**: Clerk.js with role-based access
- **Mapping**: Mapbox GL JS with React Map GL
- **Charts**: Recharts, D3.js for advanced visualizations
- **State Management**: Zustand, React Query
- **Validation**: Zod schemas with runtime validation
- **Testing**: Vitest, Testing Library, Jest DOM

### **Production Systems**
- **Error Handling**: Classification, recovery, and reporting system
- **Performance Monitoring**: Real-time metrics with threshold alerts
- **Caching**: Multi-level cache with React Query integration
- **Accessibility**: Focus management, screen reader support, ARIA compliance
- **Testing**: Comprehensive test suite with coverage reporting

## 🚀 **Getting Started**

### **Prerequisites**
- Node.js 18+ 
- npm or yarn
- Mapbox account (for mapping features)

### **Installation**

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kerry-leasing
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Add your environment variables:
   ```env
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key_here
   CLERK_SECRET_KEY=your_clerk_secret_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📋 **Available Scripts**

### **Development**
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

### **Testing**
```bash
npm run test         # Run all tests
npm run test:ui      # Visual test runner
npm run test:coverage # Generate coverage report
npm run test:watch   # Watch mode for development
```

### **Code Quality**
```bash
npm run format       # Format code with Prettier
npm run format:check # Check code formatting
npm run analyze      # Bundle size analysis
```

## 🏢 **Multi-Tenant Configuration**

The system supports multiple customers with isolated data and custom branding:

```typescript
// Customer configuration example
const customerConfig = {
  id: 'wolverine',
  name: 'Wolverine Trucking',
  branding: {
    companyName: 'Wolverine Trucking',
    logoUrl: '/wolverine-logo.png',
    primaryColor: '#2563eb',
  },
  features: {
    maintenanceTracking: true,
    fuelAnalytics: true,
    idleAnalysis: true,
    reportGeneration: true,
  },
  dataMapping: {
    vehicleNumberField: 'Number',
    unitField: 'Unit',
    // ... other field mappings
  }
}
```

## 📊 **Data Sources**

The system supports CSV data integration with configurable field mapping:

- **Fleet Data**: Vehicle information, status, mileage
- **Maintenance Records**: Repair history, service descriptions, dates
- **Performance Data**: Fuel usage, idle time, efficiency metrics

## 🗺️ **Mapping & Analytics**

### **Mapbox Integration**
- Interactive maps with vehicle locations
- Clustering for large datasets
- Geofencing capabilities
- Heatmap visualizations

### **Idle Analysis**
- Location-based idle event tracking
- Geofenced area analysis
- Driver behavior insights
- Fuel waste calculations

## ♿ **Accessibility**

Full WCAG 2.1 AA compliance with:
- **Keyboard Navigation**: Complete keyboard accessibility
- **Screen Reader Support**: ARIA labels and live regions
- **Focus Management**: Proper focus trapping and restoration
- **Color Contrast**: Meets accessibility standards
- **Responsive Design**: Works on all devices and screen sizes

## 🛡️ **Error Handling**

Enterprise-grade error handling system:
- **Automatic Classification**: Errors categorized by type and severity
- **Recovery Strategies**: Automatic retries and fallback mechanisms
- **User-Friendly Messages**: Clear, actionable error messages
- **Centralized Reporting**: Error tracking and analytics

## ⚡ **Performance**

Optimized for production with:
- **Real-time Monitoring**: Performance metrics and alerts
- **Intelligent Caching**: Multi-level cache with automatic invalidation
- **Code Splitting**: Optimized bundle loading
- **Image Optimization**: Next.js Image component with lazy loading
- **Memory Management**: Efficient data handling and cleanup

## 🧪 **Testing**

Comprehensive testing strategy:
- **Unit Tests**: Individual component and function testing
- **Integration Tests**: Feature-level testing with real data flows
- **Accessibility Tests**: Automated accessibility compliance checking
- **Performance Tests**: Load testing and performance regression detection

## 📁 **Project Structure**

```
├── app/                    # Next.js app directory
│   ├── portal/            # Main application pages
│   └── globals.css        # Global styles
├── components/            # Reusable UI components
│   ├── ui/               # Base UI components
│   ├── dashboard/        # Dashboard-specific components
│   └── layout/           # Layout components
├── lib/                  # Core utilities and services
│   ├── validation/       # Runtime validation with Zod
│   ├── performance/      # Performance monitoring
│   ├── cache/           # Caching system
│   ├── patterns/        # Advanced component patterns
│   ├── accessibility/   # Accessibility utilities
│   ├── errors/          # Error handling system
│   └── state/           # State management
├── test/                # Testing infrastructure
│   ├── utils/           # Testing utilities
│   └── [feature]/      # Feature-specific tests
└── public/              # Static assets
    └── data/           # CSV data files
```

## 🔧 **Configuration**

### **Environment Variables**
```env
# Mapbox (required for mapping features)
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=

# Clerk Authentication (required)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Optional: Performance monitoring
NEXT_PUBLIC_PERFORMANCE_MONITORING=true
```

### **Customer Configuration**
Each customer can be configured with:
- Custom branding (logo, colors, company name)
- Feature toggles (maintenance, analytics, reporting)
- Data source mapping (CSV field mappings)
- Service request handling (external links, forms, APIs)

## 🚀 **Deployment**

### **Vercel (Recommended)**
1. Connect your Git repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on Git push

### **Other Platforms**
The application is compatible with:
- **Netlify**: Static site deployment
- **AWS**: EC2, Lambda, or Amplify
- **Google Cloud**: App Engine or Cloud Run
- **Docker**: Containerized deployment

## 📈 **Monitoring & Analytics**

Built-in monitoring includes:
- **Performance Metrics**: API response times, render performance
- **Error Tracking**: Automatic error classification and reporting
- **User Analytics**: Interaction tracking and usage patterns
- **Cache Performance**: Hit rates and invalidation patterns

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### **Development Guidelines**
- Follow TypeScript best practices
- Write tests for new features
- Ensure accessibility compliance
- Update documentation as needed
- Run linting and formatting before commits

## 📄 **License**

This project is proprietary software developed for Kerry Brothers Truck Repair.

## 🆘 **Support**

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation in `/docs`

## 🎯 **Roadmap**

### **Phase 4 - Advanced Features**
- [ ] Real-time notifications
- [ ] Mobile app integration
- [ ] Advanced reporting engine
- [ ] API for third-party integrations

### **Phase 5 - Scale & Optimization**
- [ ] Database integration
- [ ] Advanced caching strategies
- [ ] Microservices architecture
- [ ] Enhanced security features

---

**Built with ❤️ for the fleet management industry**

This is a **production-ready, enterprise-grade** application designed to scale with your business needs while maintaining the highest standards of performance, accessibility, and user experience.