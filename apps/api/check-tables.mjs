import 'dotenv/config';
import { PrismaClient } from './src/generated/app-client/index.js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.APP_DATABASE_URL } }
});

async function checkTables() {
  try {
    const result = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'motive_%'
      ORDER BY table_name
    `;
    
    console.log('Motive tables found:', result.length);
    result.forEach(row => console.log(`  - ${row.table_name}`));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTables();
