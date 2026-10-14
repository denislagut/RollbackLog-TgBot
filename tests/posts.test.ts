import assert from 'node:assert/strict';
import test from 'node:test';
import { createBot } from '../src/bot.js';
import type { Update } from 'grammy/types';

test('private draft preview, custom options, stale confirmation and administrator access', async () => {
  const bot = createBot({ botToken: '123:test', channelId: '@test_channel' });
  bot.botInfo = {
    id: 123, is_bot: true, first_name: 'Test', username: 'test_bot',
    can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  };
  const calls: { method: string; payload: Record<string, any> }[] = [];
  let admin = true;
  let updateId = 0;
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    let result: any = true;
    if (method === 'getChat') result = { id: -100123, type: 'channel', title: 'Test' };
    if (method === 'getChatMember') result = { status: admin ? 'creator' : 'member' };
    if (method === 'sendMessage') result = {
      message_id: calls.length, date: 1, chat: { id: 42, type: 'private', first_name: 'Owner' },
      text: (payload as any).text,
    };
    return { ok: true, result };
  });
  const from = { id: 42, is_bot: false, first_name: 'Owner' };
  const chat = { id: 42, type: 'private' as const, first_name: 'Owner' };
  async function text(value: string) {
    await bot.handleUpdate({
      update_id: ++updateId,
      message: { message_id: updateId, date: 1, from, chat, text: value,
        entities: value.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: value.split(' ')[0]!.length }] : undefined },
    });
  }
  await text('/post');
  await text('Тестовый пост');
  const confirmation = calls.findLast((call) => call.payload.text?.startsWith('Предпросмотр'))!;
  const oldPublish = confirmation.payload.reply_markup.inline_keyboard[0][0].callback_data;
  await text('/buttons За | Против | Воздержусь');
  const preview = calls.findLast((call) => call.payload.text === 'Тестовый пост')!;
  assert.deepEqual(preview.payload.reply_markup.inline_keyboard.flat().map((button: any) => button.text),
    ['За · 0', 'Против · 0', 'Воздержусь · 0']);
  await bot.handleUpdate({
    update_id: ++updateId,
    callback_query: { id: 'test', from, chat_instance: 'test', data: oldPublish,
      message: { message_id: 5, date: 1, chat, text: 'Предпросмотр' } },
  } as Update);
  assert.equal(calls.findLast((call) => call.method === 'answerCallbackQuery')?.payload.text,
    'Этот черновик уже недоступен.');
  assert.ok(!calls.some((call) => call.method === 'sendMessage' && call.payload.chat_id === '@test_channel'));
  admin = false;
  await text('/post');
  assert.match(calls.at(-1)!.payload.text, /администраторы/);
});
