# 🚀 Quick Setup Guide

## Step-by-Step Setup Instructions

### 1️⃣ Install Dependencies (5 minutes)

```bash
# From the root directory
pnpm install
```

This will install all dependencies for all packages in the monorepo.

---

### 2️⃣ Set Up Clerk (10 minutes)

1. **Create Clerk Account**: Go to [clerk.com](https://clerk.com) and sign up
2. **Create Application**: Click "Add Application"
3. **Enable Organizations**:
   - Go to **Configure** → **Organizations**
   - Toggle "Enable Organizations" ON
   - Save changes
4. **Get API Keys**:
   - Go to **API Keys** in the sidebar
   - Copy your **Publishable Key** (starts with `pk_test_`)
   - Copy your **Secret Key** (starts with `sk_test_`)

---

### 3️⃣ Configure Environment Variables (5 minutes)

**Backend Configuration:**

```bash
cd apps/api
cp .env.example .env
```

Edit `apps/api/.env`:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/kerry_leasing?schema=public"
CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
ALLOWED_ORIGINS=http://localhost:3000
```

**Frontend Configuration:**

```bash
cd apps/web
cp .env.example .env.local
```

Edit `apps/web/.env.local`:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
NEXT_PUBLIC_API_URL=http://localhost:4000
```

**⚠️ Important**: Use the **same** Clerk keys in both files!

---

### 4️⃣ Set Up Database (5 minutes)

**Option A: Local PostgreSQL**

1. Install PostgreSQL locally
2. Create database: `createdb kerry_leasing`
3. Update `DATABASE_URL` in `apps/api/.env`

**Option B: Hosted PostgreSQL (Recommended for quick start)**

1. Create free database at [railway.app](https://railway.app) or [supabase.com](https://supabase.com)
2. Copy the connection string
3. Update `DATABASE_URL` in `apps/api/.env`

**Run Migrations:**

```bash
cd apps/api
pnpm prisma:migrate
pnpm prisma:generate
```

---

### 5️⃣ Start Development (1 minute)

From the **root directory**:

```bash
pnpm dev
```

This will start:
- ✅ Web app at [http://localhost:3000](http://localhost:3000)
- ✅ API server at [http://localhost:4000](http://localhost:4000)

---

## 🧪 Testing the Setup

1. Open [http://localhost:3000](http://localhost:3000)
2. Click **Sign Up** and create an account
3. **Create an Organization** when prompted (give it any name)
4. You'll be redirected to `/app`
5. Click **"Test Auth (/me)"** button
   - Should show your userId, orgId, and role
6. Click **"Load Units (/units)"** button
   - Should return empty array (database is empty initially)

**✅ If both API calls work, you're all set!**

---

## 📝 Environment Variables Reference

### Required for API (apps/api/.env)
- `DATABASE_URL`: PostgreSQL connection string
- `CLERK_SECRET_KEY`: Clerk secret key (server-side)
- `PORT`: API server port (default: 4000)

### Required for Web (apps/web/.env.local)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk publishable key
- `CLERK_SECRET_KEY`: Clerk secret key (same as API)
- `NEXT_PUBLIC_API_URL`: Backend URL (http://localhost:4000 in dev)

---

## 🐛 Troubleshooting

### "Module not found" errors
```bash
pnpm install
cd apps/api && pnpm prisma:generate
```

### "Invalid token" errors
- Verify Clerk keys are correct
- Make sure Organizations are enabled in Clerk dashboard
- Check that both apps use the **same** Clerk keys

### Database connection errors
- Verify PostgreSQL is running
- Check `DATABASE_URL` format is correct
- Try running `pnpm prisma:migrate` again

### CORS errors
- Check `ALLOWED_ORIGINS` in `apps/api/.env` includes `http://localhost:3000`
- Verify `NEXT_PUBLIC_API_URL` in web app points to `http://localhost:4000`

---

## 📚 Next Steps

After setup is complete:

1. **Explore the code structure** (see main README.md)
2. **Add telematics providers** (Samsara, Geotab, etc.)
3. **Implement data ingestion** (scheduled jobs)
4. **Build out UI components** (add Tailwind, shadcn/ui)
5. **Add business logic** (units, repairs, analytics)

---

## 🆘 Need Help?

Check the main **README.md** for:
- Complete API documentation
- Project structure explanation
- Development scripts reference
- Deployment guides

Happy coding! 🎉
