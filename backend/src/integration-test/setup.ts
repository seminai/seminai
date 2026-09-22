import '@jest/globals';
import {
  deleteAllTestCompanies,
  deleteTestUser,
  deleteAllAgentMemories,
  deleteAllOuterLoopTriggers,
  prisma,
} from './helpers';
import { TEST_USER_EMAIL } from './constants';
import dotenv from 'dotenv';
import { closeRedisConnection } from '../infrastructure/queue/redis.connection';

dotenv.config();

let testUserId: string | null = null;

beforeAll(async () => {
  await prisma.$connect();
  console.log('🔌 Connected to test database');
});

afterAll(async () => {
  await cleanupTestData();
  closeRedisConnection();
  await prisma.$disconnect();
  console.log('✅ Test database cleaned and disconnected');
});

export async function cleanupTestData(): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
    if (user) {
      await deleteAllAgentMemories(user.id);
      await deleteAllOuterLoopTriggers(user.id);
      // AgentTasks are cascade-deleted when chats are cleaned up in deleteTestUser
      await deleteAllTestCompanies(user.id);
      await deleteTestUser();
      console.log('🧹 Test data cleaned');
    }
  } catch (error) {
    console.error('❌ Error cleaning test data:', error);
  }
}

export async function getTestUserId(): Promise<string> {
  if (testUserId) {
    return testUserId;
  }
  const user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
  });

  if (!user) {
    throw new Error('Test user not found. Make sure to create it in your test.');
  }
  testUserId = user.id;
  return testUserId;
}

export { prisma };
