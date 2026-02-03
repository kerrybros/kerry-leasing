# Fleet Management UI

Modern, TruckGenius-inspired UI for managing fleet units with integrated repair and telematics data.

## Features

### 🚛 Fleet Overview (`/app`)
- **KPI Dashboard**: View fleet-wide metrics for last 30 days
  - Total Miles Driven
  - Idle Hours
  - Average Fuel Economy
  - Active Unit Count
- **Fleet Table**: List all units with quick access to details
- **One-Click Access**: Open unit details in new tab

### 📊 Unit Detail Page (`/app/units/[vin]`)
- **Tabbed Interface**:
  - **Overview**: Quick summary of repairs and telematics
  - **Repairs**: Complete repair/invoice history
  - **Telematics**: Detailed daily metrics for last 30 days
- **Statistics Cards**: Visual metrics for:
  - Total repairs & costs
  - Miles driven
  - Idle hours
  - Fuel economy
- **Daily Metrics Table**: Date-by-date breakdown of:
  - Miles driven
  - Idle time
  - Fuel consumption
  - MPG
  - Engine hours

## Design System

### Color Palette
Based on TruckGenius.ai aesthetic:
- **Primary**: Deep blue (#2563eb, #1e3a8a) - Professional, trustworthy
- **Secondary**: Bright cyan (#06b6d4, #0891b2) - Modern, tech-forward
- **Accent**: Orange/amber (#f59e0b) - Highlights, warnings
- **Success**: Green (#22c55e) - Positive metrics
- **Neutrals**: Gray scale for backgrounds and text

### Components
- **KPI Cards**: Color-coded metric cards with borders
- **Stat Cards**: Icon-based summary cards
- **Tables**: Clean, hover-enabled data tables
- **Badges**: Status indicators (success, warning, error)
- **Buttons**: Primary, secondary, outline variants

## API Integration

### Endpoints Used
- `GET /units` - Fetch all fleet units
- `GET /units/:vin/repairs` - Get repair history for unit
- `GET /telematics/daily?vin=...&from=...&to=...` - Daily telematics metrics
- `GET /telematics/summary?from=...&to=...` - Aggregated metrics

### Data Flow
1. **Fleet Overview**:
   - Loads all units for organization
   - Fetches 30-day telematics summary
   - Displays KPIs and fleet table

2. **Unit Detail**:
   - Loads repair history from repair DB
   - Fetches 30-day telematics data
   - Calculates summary statistics
   - Displays in tabbed interface

## Customization

The UI is intentionally clean and simple to allow for easy customization:

- **Colors**: Modify CSS variables in `globals.css` under `:root`
- **Components**: Edit files in `/components` folder
- **Layout**: Adjust grid layouts and spacing in page components
- **Data**: All API calls are in page components for easy modification

## Next Steps

Potential enhancements:
- [ ] Charts/graphs for telematics trends
- [ ] Date range picker for custom periods
- [ ] Export to CSV functionality
- [ ] Real-time updates
- [ ] Filters and search
- [ ] Vehicle comparison view
- [ ] Maintenance alerts/notifications
