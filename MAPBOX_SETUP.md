# 🗺️ Mapbox Setup Guide

## Quick Setup (2 minutes)

### 1. Get Your Free Mapbox Token
1. Go to [mapbox.com](https://account.mapbox.com/access-tokens/)
2. Sign up for a free account (50,000 map loads/month free)
3. Copy your **Default Public Token**

### 2. Add Token to Your Project
1. Open `.env.local` file in your project root
2. Replace the demo token with your real token:
   ```
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_actual_token_here
   ```
3. Save the file and restart your dev server

### 3. Test the Integration
1. Navigate to **Fleet Dashboard** → **Idle Analysis** tab
2. You should see a fully interactive map with:
   - ✅ Real satellite/street view maps
   - ✅ Interactive idle event markers
   - ✅ Geofence overlays
   - ✅ Clustering and heatmaps
   - ✅ Detailed popups

## 🎯 Demo Features Included

### **Interactive Map Layers:**
- **Street View** - Clean, detailed street maps
- **Satellite View** - High-resolution aerial imagery  
- **Dark Mode** - Professional dark theme

### **Idle Event Visualization:**
- **Aggregated View** - Events grouped by location with bubble sizes
- **Individual View** - Each event as a separate marker with clustering
- **Smart Clustering** - Automatically groups nearby events when zoomed out
- **Heatmap Overlay** - Density visualization of idle hotspots

### **Geofence System:**
- **Customer Sites** (Green) - Authorized idle locations
- **Depot/Maintenance** (Blue) - Company facilities
- **Rest Areas** (Orange) - Highway stops and service areas
- **No-Idle Zones** (Red) - City ordinance restricted areas
- **Loading Docks** (Green) - Customer pickup/delivery points

### **Interactive Features:**
- **Click Events** - Detailed popups for each idle event
- **Location Bubbles** - Aggregated statistics by geofence
- **Layer Controls** - Toggle geofences, heatmap, and map styles
- **Zoom Controls** - Smooth navigation and clustering
- **Real-time Filtering** - Date ranges, vehicles, drivers

### **Event Details:**
- **Vehicle Information** - Unit number, driver name
- **Time & Duration** - Start/end times, total idle minutes
- **Cost Analysis** - Fuel consumption and dollar impact
- **Location Context** - Geofence name or street address
- **Severity Indicators** - Color-coded by idle duration
- **Reason Codes** - Driver-provided explanations (when available)

## 🚀 Production Ready Features

The demo includes enterprise-grade capabilities:

- **Performance Optimized** - Efficient clustering for thousands of events
- **Mobile Responsive** - Touch-friendly controls and popups
- **Accessibility** - Keyboard navigation and screen reader support
- **Security** - CSP headers and secure token handling
- **Scalable Architecture** - Ready for real-time data integration

## 🔧 Customization Options

Easy to modify:
- **Geofence Colors** - Match your brand colors
- **Marker Styles** - Custom icons and sizes  
- **Popup Content** - Add/remove data fields
- **Map Themes** - Custom Mapbox studio styles
- **Clustering Rules** - Adjust grouping behavior
- **Heatmap Intensity** - Fine-tune density visualization

---

**Ready to see it in action?** Just add your Mapbox token and navigate to the Idle Analysis tab! 🎉
