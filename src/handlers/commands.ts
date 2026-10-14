import type { Bot } from 'grammy';

export function registerCommands(bot: Bot): void {
  bot.command('start', (ctx) => ctx.reply('Бот для логирования откатов.Команда /denispleasehelpme для получения списка команд.'));
  bot.command(['help', 'denispleasehelpme'], (ctx) => ctx.reply(
    '/post — создать пост с голосованием\n' +
    '/buttons Согласен | Не согласен — настроить варианты\n' +
    '/cancel — отменить черновик\n/help — показать команды'));
}
