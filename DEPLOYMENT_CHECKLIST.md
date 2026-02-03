# Quick Deployment Checklist

Use this checklist to deploy to production step-by-step.

## ☐ Phase 1: Clerk Production Setup (Do First!)

1. **Create Clerk Production Instance**
   - Go to https://dashboard.clerk.com
   - Select your app → Click "Production" → Create instance
   - ✅ Production instance created

2. **Get Production Keys**
   - Copy `CLERK_SECRET_KEY` (starts with `sk_live_`)
   - Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_live_`)
   - ✅ Keys copied and saved securely

3. **Create Wolverine Organization**
   - In Clerk dashboard → Organizations → Create new
   - Name: "Wolverine"
   - Copy the organization ID (starts with `org_`)
   - ✅ Org created, ID: `_________________`

---

## ☐ Phase 2: Deploy API to Render

1. **Create Web Service**
   - Go to https://dashboard.render.com
   - New + → Web Service
   - Connect GitHub repo
   - ✅ Service created

2. **Configure Build Settings**
   - Name: `kerry-leasing-api`
   - Root Directory: `apps/api`
   - Build Command: `pnpm install && pnpm prisma:generate && pnpm build`
   - Start Command: `pnpm start`
   - ✅ Build settings configured

3. **Add Environment Variables**
   Copy from `apps/api/.env` but use production values:
   ```
   PORT=4000
   NODE_ENV=production
   REPAIR_DATABASE_URL=<existing repair db>
   APP_DATABASE_URL=<existing app db>
   CLERK_SECRET_KEY=<production key from Phase 1>
   CLERK_PUBLISHABLE_KEY=<production key from Phase 1>
   ALLOWED_ORIGINS=<will add Vercel URL in Phase 3>
   CRON_SECRET=<generate strong random string>
   ```
   - ✅ All environment variables added

4. **Deploy & Test**
   - Click "Deploy"
   - Wait for build to complete
   - Note your API URL: `https://________________.onrender.com`
   - Test: `curl https://YOUR_URL/health`
   - ✅ API deployed and responding

---

## ☐ Phase 3: Deploy Frontend to Vercel

1. **Create New Project**
   - Go to https://vercel.com/dashboard
   - New Project → Import Git Repository
   - ✅ Project created

2. **Configure Build Settings**
   - Framework: Next.js
   - Root Directory: `apps/web`
   - Build Command: `cd ../.. && pnpm install && cd apps/web && pnpm build`
   - ✅ Build settings configured

3. **Add Environment Variables**
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<production key from Phase 1>
   CLERK_SECRET_KEY=<production key from Phase 1>
   NEXT_PUBLIC_API_URL=<Render API URL from Phase 2>
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app
   ```
   - ✅ All environment variables added

4. **Deploy**
   - Click "Deploy"
   - Note your Vercel URL: `https://________________.vercel.app`
   - ✅ Frontend deployed

---

## ☐ Phase 4: Connect Everything

1. **Update Clerk Domains**
   - Clerk dashboard → Production → Domains
   - Add Vercel URL (without https://)
   - ✅ Domain added to Clerk

2. **Update API CORS**
   - Render dashboard → Environment variables
   - Update `ALLOWED_ORIGINS` to include Vercel URL
   - Example: `https://your-app.vercel.app`
   - ✅ CORS updated

3. **Redeploy API** (to pick up new CORS settings)
   - Render dashboard → Manual Deploy → Deploy latest commit
   - ✅ API redeployed

---

## ☐ Phase 5: Migrate Telematics Data

**Only needed if you have existing telematics data with wrong org ID**

1. **Update Org ID in Database**
   ```bash
   # Local terminal
   cd apps/api
   export APP_DATABASE_URL="<your production db url>"
   pnpm update-org-id org_2slAi3SqvSCzvqCJE3i2YtWQCsO org_PRODUCTION_ORG_ID
   ```
   - ✅ Data migrated to production org ID

---

## ☐ Phase 6: Setup Cron Job

1. **Create Cron Job in Render**
   - New + → Cron Job
   - Name: `motive-daily-sync`
   - Schedule: `0 6 * * *` (6 AM daily)
   - Command:
     ```bash
     curl -X POST \
       -H "x-cron-secret: YOUR_CRON_SECRET" \
       https://YOUR_API_URL/cron/sync-motive
     ```
   - ✅ Cron job created

2. **Test Cron Job**
   ```bash
   curl -X POST \
     -H "x-cron-secret: YOUR_CRON_SECRET" \
     https://YOUR_API_URL/cron/sync-motive
   ```
   - ✅ Cron job tested and working

---

## ☐ Phase 7: Final Verification

1. **Test Authentication**
   - [ ] Can access frontend URL
   - [ ] Can sign in with Clerk
   - [ ] Can see Wolverine organization

2. **Test API**
   - [ ] `/health` endpoint responds
   - [ ] `/me` endpoint returns user data
   - [ ] CORS working (no console errors)

3. **Test Fleet Data**
   - [ ] Can see units in fleet view
   - [ ] Can click unit to see details
   - [ ] Repair data loading correctly

4. **Test Telematics Data**
   - [ ] Telematics KPIs showing on fleet view
   - [ ] Unit detail page shows telematics tab
   - [ ] Daily metrics visible
   - [ ] Data matches Motive dashboard

---

## 🎉 Production URLs

Once complete, record your URLs:

- **Frontend**: https://________________.vercel.app
- **API**: https://________________.onrender.com
- **Clerk Dashboard**: https://dashboard.clerk.com

---

## 🆘 Troubleshooting

### Build fails on Render
- Check build logs
- Verify all dependencies in package.json
- Ensure Prisma generates before build

### CORS errors
- Check ALLOWED_ORIGINS in Render
- Verify Vercel URL is exact match (no trailing slash)
- Redeploy API after changing CORS

### Clerk auth fails
- Verify production keys (not test keys)
- Check domain is added to Clerk
- Ensure keys match between API and frontend

### No telematics data
- Check org ID matches Clerk org
- Verify APP_DATABASE_URL is correct
- Run org ID migration script if needed

---

## 📞 Support

If you get stuck:
1. Check deployment logs (Render/Vercel dashboards)
2. Verify all environment variables
3. Test each service independently
4. Check CORS and domain configuration
