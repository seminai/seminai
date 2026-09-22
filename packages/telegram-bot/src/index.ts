import { config, validateConfig } from './config';
import { createBot } from './bot';

async function main(): Promise<void> {
  console.log('Starting SeminAI Telegram Bot...');

  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error);
    process.exit(1);
  }

  const bot = createBot();

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('Shutting down...');
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start bot with long polling
  console.log(`Bot starting with API URL: ${config.apiUrl}`);
  console.log('Bot is running! Press Ctrl+C to stop.');

  await bot.start({
    onStart: (botInfo) => {
      console.log(`Bot @${botInfo.username} started successfully!`);
    },
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
