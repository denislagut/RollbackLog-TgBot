import { createBot } from './bot.js';
import { loadConfig } from './config/env.js';

async function main(): Promise<void> {
  const bot = createBot(loadConfig());

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      if (bot.isRunning()) void bot.stop();
    });
  }

  await bot.start({
    onStart: ({ username }) => console.log(`Бот @${username} запущен`),
  });
}

main().catch((error: unknown) => {
  console.error('Не удалось запустить бота:',
    error instanceof Error ? error.message : 'Неизвестная ошибка');
  process.exitCode = 1;
});
