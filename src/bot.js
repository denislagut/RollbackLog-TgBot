import { Bot } from 'grammy';
import { registerCommands } from './handlers/commands.js';

export function createBot(config) {
  const bot = new Bot(config.botToken);

  registerCommands(bot);
  bot.catch(({ error, ctx }) => {
    console.error(`Ошибка обработки обновления ${ctx.update.update_id}:`, error.message);
  });

  return bot;
}
