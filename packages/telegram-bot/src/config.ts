export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  apiUrl: process.env.SEMINAI_API_URL || 'http://localhost:3000',
  debug: process.env.DEBUG === 'true',
};

export function validateConfig(): void {
  if (!config.telegramToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }
  if (!config.apiUrl) {
    throw new Error('SEMINAI_API_URL is required');
  }
}
