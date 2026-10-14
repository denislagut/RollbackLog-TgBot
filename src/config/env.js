import 'dotenv/config';

export function loadConfig() {
  const botToken = process.env.BOT_TOKEN?.trim();

  if (!botToken) {
    throw new Error('Укажи BOT_TOKEN в файле .env (см. .env.example).');
  }

  return {
    botToken,
    channelId: process.env.CHANNEL_ID?.trim() || undefined,
  };
}
