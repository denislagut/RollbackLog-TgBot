import { Bot } from 'grammy';
import type { Config } from './config/env.js';
import { registerCommands } from './handlers/commands.js';
import { registerPosts } from './handlers/posts.js';

export function createBot(config: Config): Bot {
  const bot = new Bot(config.botToken);

  registerCommands(bot);
  registerPosts(bot, config);
  bot.catch(({ error, ctx }) => {
    console.error(`Ошибка обработки обновления ${ctx.update.update_id}:`,
      error instanceof Error ? error.message : 'Неизвестная ошибка');
  });

  return bot;
}
