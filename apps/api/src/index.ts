import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import routes from './routes/index.js';
import { disconnectRepairDb, isRepairDbAvailable } from './db/repairRepo.js';
import { disconnectAppDb, isAppDbAvailable } from './db/appRepo.js';
import { assertRepairDbSafety } from './safety/repairDbSafety.js';

// Create Express app
const app = express();

// Middleware
app.use(
  cors({
    origin: config.cors.allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Mount routes
app.use('/', routes);

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: config.nodeEnv === 'development' ? err.message : undefined,
    });
  }
);

// Start server
const port = config.port;

async function startServer() {
  try {
    console.log('\n🔒 Running repair database safety checks...\n');
    
    // CRITICAL: Assert repair database is configured safely
    // This will exit(1) if checks fail (unless in test mode or explicitly bypassed)
    assertRepairDbSafety(config.repairDatabaseUrl, {
      allowUnsafe: process.env.ALLOW_UNSAFE_REPAIR_DB === 'true',
      isTestMode: config.nodeEnv === 'test',
    });

    // Check database connections
    console.log('\n🔍 Checking database connections...\n');
    
    // Check REPAIR database (read-only)
    if (config.repairDatabaseUrl) {
      const repairAvailable = await isRepairDbAvailable();
      if (repairAvailable) {
        console.log('✓ Repair database (READ-ONLY) connected');
      } else {
        console.warn('⚠️  Repair database connection failed');
        console.warn('   Unit and repair endpoints will not work');
      }
    } else {
      console.warn('⚠️  REPAIR_DATABASE_URL not configured');
      console.warn('   Unit and repair endpoints will not work');
    }

    // Check APP database (read-write)
    if (config.appDatabaseUrl) {
      const appAvailable = await isAppDbAvailable();
      if (appAvailable) {
        console.log('✓ App database connected');
      } else {
        console.warn('⚠️  App database connection failed');
        console.warn('   Org mapping features will not work');
      }
    } else {
      console.warn('⚠️  APP_DATABASE_URL not configured');
      console.warn('   Org mapping features will not work');
      console.warn('   Run: pnpm prisma:app:migrate to set up app database');
    }

    console.log('');

    app.listen(port, () => {
      console.log(`✓ API server running on http://localhost:${port}`);
      console.log(`✓ Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await disconnectRepairDb();
  await disconnectAppDb();
  process.exit(0);
});

startServer();
