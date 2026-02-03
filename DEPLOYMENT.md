# Kerry Leasing Portal - Deployment Guide

## Prerequisites

1. **Render Account** - For API backend
2. **Vercel Account** - For Next.js frontend
3. **Clerk Production Instance** - For authentication

---

## Step 1: Deploy API to Render

### A. Create New Web Service
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `kerry-leasing-api`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your production branch)
   - **Root Directory**: `apps/api`
   - **Environment**: `Node`
   - **Build Command**: `pnpm install && pnpm prisma:app:generate && pnpm prisma:repair:generate && pnpm build`
   - **Start Command**: `pnpm start`
   - **Instance Type**: Starter ($7/month) or higher

### B. Environment Variables (Render)
Add these in Render dashboard under "Environment":

```bash
# Server
PORT=4000
NODE_ENV=production

# Repair Database (READ-ONLY)
REPAIR_DATABASE_URL=postgresql://fleet_saas_db_user:WePjCXZWMvkSaGAoTKoMJ3TikWmrQvWB@dpg-d2mbnhidbo4c73d4shrg-a.ohio-postgres.render.com:5432/fleet_saas_db?sslmode=require&schema=public&options=-c%20default_transaction_read_only=on

# App Database (READ-WRITE)
APP_DATABASE_URL=postgresql://kerry_leasing_user:inBouJpLAk7IC6MHYC7o1IctsTCSy30D@dpg-d60c34ggjchc739924g0-a.virginia-postgres.render.com:5432/kerry_leasing?sslmode=require&schema=public

# Clerk (PRODUCTION KEYS - get from Clerk after creating prod instance)
CLERK_SECRET_KEY=sk_live_YOUR_PRODUCTION_SECRET_KEY
CLERK_PUBLISHABLE_KEY=pk_live_YOUR_PRODUCTION_PUBLISHABLE_KEY

# CORS (update with your Vercel domain after deployment)
ALLOWED_ORIGINS=https://your-app.vercel.app,https://www.your-domain.com

# Cron Secret (generate a secure random string)
CRON_SECRET=YOUR_SECURE_RANDOM_STRING_HERE
```

### C. After First Deploy
Once the API is deployed, note your Render URL:
- Example: `https://kerry-leasing-api.onrender.com`
- You'll need this for the frontend configuration

---

## Step 2: Create Clerk Production Instance

### A. Upgrade to Production
1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Select your application
3. Click **"Production"** in the top nav
4. Follow prompts to create production instance

### B. Configure Production Settings
1. **Domain**: Set your production domain (Vercel will provide this)
2. **Organizations**: Enable organization features
3. **Roles**: Configure "internal" and "external" roles

### C. Get Production Keys
Copy these from Clerk dashboard:
- `CLERK_SECRET_KEY` (starts with `sk_live_`)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_live_`)

### D. Create Wolverine Organization
1. In Clerk dashboard, go to "Organizations"
2. Create new organization named "Wolverine"
3. Copy the organization ID (starts with `org_`)
4. This will be used to link telematics data

---

## Step 3: Deploy Frontend to Vercel

### A. Create New Project
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && pnpm install && cd apps/web && pnpm build`
   - **Output Directory**: `.next`
   - **Install Command**: `pnpm install`

### B. Environment Variables (Vercel)
Add these in Vercel project settings:

```bash
# Clerk Production Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_YOUR_PRODUCTION_PUBLISHABLE_KEY
CLERK_SECRET_KEY=sk_live_YOUR_PRODUCTION_SECRET_KEY

# API URL (your Render API URL)
NEXT_PUBLIC_API_URL=https://kerry-leasing-api.onrender.com

# Clerk URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app
```

### C. Domain Setup
1. After deployment, Vercel will give you a URL like `your-app.vercel.app`
2. Go back to Clerk Production settings
3. Add this domain to allowed domains
4. Update CORS in Render API environment variables

---

## Step 4: Update Telematics Data with Production Org ID

After you create the Wolverine organization in Clerk Production:

1. Get the production org ID (e.g., `org_XXXXXXXXXXXXX`)
2. Run this script to update all existing telematics data:

```bash
cd apps/api
pnpm tsx src/scripts/update-org-id.mjs
```

I'll create this script for you.

---

## Step 5: Setup Cron Jobs (Render)

### A. Create Cron Job
1. In Render dashboard, click **"New +"** → **"Cron Job"**
2. Configure:
   - **Name**: `motive-daily-sync`
   - **Schedule**: `0 6 * * *` (6 AM daily, America/Toronto time)
   - **Command**: `curl -X POST -H "x-cron-secret: YOUR_CRON_SECRET" https://kerry-leasing-api.onrender.com/cron/sync-motive`

### B. Test Cron Job
Test manually with:
```bash
curl -X POST \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  https://kerry-leasing-api.onrender.com/cron/sync-motive
```

---

## Step 6: Verification Checklist

- [ ] API deployed to Render and running
- [ ] Frontend deployed to Vercel and running
- [ ] Clerk production instance created
- [ ] Production domains added to Clerk
- [ ] Wolverine organization created in Clerk
- [ ] CORS updated with Vercel domain
- [ ] Telematics data updated with production org ID
- [ ] Cron job scheduled and tested
- [ ] Can log in via production URL
- [ ] Can view fleet data
- [ ] Can view telematics data

---

## Production URLs (Update After Deployment)

- **Frontend**: https://your-app.vercel.app
- **API**: https://kerry-leasing-api.onrender.com
- **Clerk Dashboard**: https://dashboard.clerk.com

---

## Security Notes

1. **Never commit production secrets** to git
2. **Rotate CRON_SECRET** - use a secure random string
3. **Database credentials** - already using SSL/TLS
4. **Clerk keys** - keep secret keys secure
5. **CORS** - only allow your production domain

---

## Rollback Plan

If something goes wrong:
1. Render: Rollback to previous deployment
2. Vercel: Instant rollbacks available in dashboard
3. Database: No schema changes needed, data is safe

---

## Need Help?

Common issues:
- **Build failures**: Check build logs in Render/Vercel
- **CORS errors**: Update ALLOWED_ORIGINS in Render
- **Auth errors**: Verify Clerk production keys
- **Database errors**: Check connection strings and SSL settings
