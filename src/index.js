import { createBot } from './bot.js';
import { loadConfig } from './config/env.js';

async function main() {
  const bot = createBot(loadConfig());

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      if (bot.isRunning()) bot.stop();
    });
  }

  await bot.start({
    onStart: ({ username }) => console.log(`Бот @${username} запущен`),
  });
}

main().catch((error) => {
  console.error('Не удалось запустить бота:', error.message);
  process.exitCode = 1;
});
