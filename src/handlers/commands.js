export function registerCommands(bot) {
  bot.command('start', (ctx) => ctx.reply('Бот работает!'));
  bot.command('help', (ctx) => ctx.reply('/start — проверить бота\n/help — показать команды'));
}
