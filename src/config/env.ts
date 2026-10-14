import 'dotenv/config';

export interface Config {
  botToken: string;
  channelId: string | undefined;
}

export function loadConfig(): Config {
  const botToken = process.env.BOT_TOKEN?.trim();

  if (!botToken) {
    throw new Error('Укажи BOT_TOKEN в файле .env (см. .env.example).');
  }

  return {
    botToken,
    channelId: process.env.CHANNEL_ID?.trim() || undefined,
  };
}
