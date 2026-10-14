import type { Api } from 'grammy';
import type { InlineKeyboardMarkup, MessageEntity } from 'grammy/types';

export interface ChannelPost {
  text: string;
  entities?: MessageEntity[];
  keyboard?: InlineKeyboardMarkup;
}

export function createPublisher(api: Api, channelId: string | undefined) {
  return {
    async publish(post: ChannelPost) {
      if (!channelId) {
        throw new Error('Укажи CHANNEL_ID в .env для публикации в канал.');
      }
      if (!post.text.trim()) {
        throw new Error('Текст поста не должен быть пустым.');
      }

      return api.sendMessage(channelId, post.text, {
        entities: post.entities,
        reply_markup: post.keyboard,
      });
    },
  };
}
