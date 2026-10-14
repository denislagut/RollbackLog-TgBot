import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { GrammyError, InlineKeyboard } from 'grammy';
import type { Bot, Context } from 'grammy';
import type { Config } from '../config/env.js';
import { createPublisher } from '../services/publishing.js';
import type { ChannelPost } from '../services/publishing.js';
import { parseLabels, VoteStore, votingKeyboard } from '../services/votes.js';

interface Draft {
  id: string;
  labels: string[];
  post?: ChannelPost;
  publishing: boolean;
}

export function registerPosts(bot: Bot, config: Config): void {
  const drafts = new Map<number, Draft>();
  const store = new VoteStore(resolve('data/votes.json'));
  const publisher = createPublisher(bot.api, config.channelId);

  async function authorize(ctx: Context): Promise<boolean> {
    let message: string | undefined;
    if (ctx.chat?.type !== 'private' || !ctx.from) {
      message = 'Создавай посты в личном чате с ботом.';
    } else if (!config.channelId) {
      message = 'Укажи CHANNEL_ID в .env и добавь бота администратором канала.';
    } else {
      try {
        const chat = await ctx.api.getChat(config.channelId);
        if (chat.type !== 'channel') {
          message = 'CHANNEL_ID должен указывать на канал, а не на бота или группу.';
        } else {
          const member = await ctx.api.getChatMember(chat.id, ctx.from.id);
          if (member.status !== 'creator' &&
            !(member.status === 'administrator' && member.can_post_messages)) {
            message = 'Создавать посты могут администраторы канала с правом публикации.';
          }
        }
      } catch {
        message = 'Не удалось проверить доступ. Проверь CHANNEL_ID и права бота в канале.';
      }
    }
    if (!message) return true;
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: message, show_alert: true });
    else await ctx.reply(message);
    return false;
  }

  async function preview(ctx: Context, draft: Draft): Promise<void> {
    if (!draft.post) return;
    const keyboard = new InlineKeyboard();
    draft.labels.forEach((label, index) => {
      keyboard.text(`${label} · 0`, 'preview:vote');
      if ((index + 1) % 2 === 0) keyboard.row();
    });
    await ctx.reply(draft.post.text, {
      entities: draft.post.entities,
      reply_markup: keyboard,
    });
    await ctx.reply('Предпросмотр. Опубликовать этот пост в канале?', {
      reply_markup: new InlineKeyboard()
        .text('Опубликовать', `publish:${draft.id}`)
        .text('Отмена', `cancel:${draft.id}`),
    });
  }

  bot.command('post', async (ctx) => {
    if (!ctx.from || !await authorize(ctx)) return;
    drafts.set(ctx.from.id, {
      id: randomUUID(), labels: ['Согласен', 'Не согласен'], publishing: false,
    });
    await ctx.reply('Отправь текст поста. Кнопки по умолчанию: Согласен | Не согласен.\n' +
      'Изменить: /buttons Согласен | Не согласен\nОтменить: /cancel');
  });

  bot.command('buttons', async (ctx) => {
    if (!ctx.from || !await authorize(ctx)) return;
    const draft = drafts.get(ctx.from.id);
    if (!draft) { await ctx.reply('Сначала создай пост командой /post.'); return; }
    if (draft.publishing) return;
    try {
      draft.labels = parseLabels(ctx.match);
      draft.id = randomUUID();
    } catch (error) {
      await ctx.reply((error as Error).message);
      return;
    }
    await ctx.reply('Кнопки сохранены. Можно отправить новый текст поста.');
    await preview(ctx, draft);
  });

  bot.command('cancel', async (ctx) => {
    if (ctx.chat.type !== 'private' || !ctx.from) return;
    if (drafts.get(ctx.from.id)?.publishing) return;
    drafts.delete(ctx.from.id);
    await ctx.reply('Черновик отменён.');
  });

  bot.callbackQuery('preview:vote', (ctx) =>
    ctx.answerCallbackQuery({ text: 'Это предпросмотр. Голосовать можно после публикации.' }));

  bot.callbackQuery(/^cancel:([\w-]+)$/, async (ctx) => {
    const draft = drafts.get(ctx.from.id);
    if (ctx.chat?.type !== 'private' || !draft || draft.id !== ctx.match[1] || draft.publishing) {
      await ctx.answerCallbackQuery({ text: 'Этот черновик уже недоступен.' }); return;
    }
    drafts.delete(ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Отменено' });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  });

  bot.callbackQuery(/^publish:([\w-]+)$/, async (ctx) => {
    if (!await authorize(ctx)) return;
    const draft = drafts.get(ctx.from.id);
    if (!draft?.post || draft.id !== ctx.match[1] || draft.publishing) {
      await ctx.answerCallbackQuery({ text: 'Этот черновик уже недоступен.' }); return;
    }
    draft.publishing = true;
    await ctx.answerCallbackQuery({ text: 'Публикую…' });
    try {
      // Send without voting buttons first: no clickable vote can precede durable storage.
      const sent = await publisher.publish(draft.post);
      drafts.delete(ctx.from.id);
      const key = `${sent.chat.id}_${sent.message_id}`;
      try {
        await store.create(key, draft.labels);
        await ctx.api.editMessageReplyMarkup(sent.chat.id, sent.message_id, {
          reply_markup: votingKeyboard(key, { labels: draft.labels, votes: {} }),
        });
        await ctx.reply('Пост опубликован с кнопками голосования.');
      } catch {
        await ctx.reply(`Пост №${sent.message_id} опубликован, но кнопки добавить не удалось. ` +
          'Проверь права бота и доступ к data/. Не публикуй этот пост повторно.');
      }
    } catch {
      draft.publishing = false;
      await ctx.reply('Telegram не подтвердил публикацию. Проверь канал перед повторной попыткой, ' +
        'чтобы не создать дубликат, и проверь права бота.');
    }
    if (!drafts.has(ctx.from.id)) {
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^vote:(-?\d+_\d+):(\d+)$/, async (ctx) => {
    const key = ctx.match[1]!;
    const message = ctx.callbackQuery.message;
    if (!message || `${message.chat.id}_${message.message_id}` !== key) {
      await ctx.answerCallbackQuery({ text: 'Голосование недоступно.' }); return;
    }
    // Answer promptly; persistence and keyboard updates may take longer than a callback timeout.
    await ctx.answerCallbackQuery({ text: 'Обрабатываю голос…' });
    try {
      await store.vote(key, ctx.from.id, Number(ctx.match[2]), async (post) => {
        try {
          await ctx.api.editMessageReplyMarkup(message.chat.id, message.message_id, {
            reply_markup: votingKeyboard(key, post),
          });
        } catch (error) {
          if (error instanceof GrammyError && error.description.includes('message is not modified')) return;
          throw error;
        }
      });
    } catch (error) {
      console.error('Не удалось обработать голос:', error instanceof Error ? error.message : 'Ошибка');
    }
  });

  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private' || ctx.message.text.startsWith('/')) { await next(); return; }
    const draft = drafts.get(ctx.from.id);
    if (!draft) { await ctx.reply('Для создания поста отправь /post.'); return; }
    if (!await authorize(ctx) || draft.publishing) return;
    draft.id = randomUUID();
    draft.post = { text: ctx.message.text, entities: ctx.message.entities };
    await preview(ctx, draft);
  });
}
