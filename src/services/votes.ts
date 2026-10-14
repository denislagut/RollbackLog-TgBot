import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { InlineKeyboard } from 'grammy';

export interface VotingPost {
  labels: string[];
  votes: Record<string, number>;
}

export function votingKeyboard(key: string, post: VotingPost): InlineKeyboard {
  const counts = post.labels.map(() => 0);
  for (const option of Object.values(post.votes)) {
    if (counts[option] !== undefined) counts[option]++;
  }
  const keyboard = new InlineKeyboard();
  post.labels.forEach((label, index) => {
    keyboard.text(`${label} · ${counts[index]}`, `vote:${key}:${index}`);
    if ((index + 1) % 2 === 0) keyboard.row();
  });
  return keyboard;
}

export function parseLabels(text: string): string[] {
  const labels = text.split('|').map((label) => label.trim());
  if (labels.length < 2 || labels.length > 6 ||
      labels.some((label) => !label || [...label].length > 40) ||
      new Set(labels).size !== labels.length) {
    throw new Error('Укажи от 2 до 6 разных вариантов через |, каждый до 40 символов.');
  }
  return labels;
}

/** One process only. Atomic replacement avoids partially written vote files. */
export class VoteStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async read(): Promise<Record<string, VotingPost>> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as Record<string, VotingPost>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private async save(posts: Record<string, VotingPost>): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, JSON.stringify(posts), 'utf8');
    await rename(temporary, this.file);
  }

  create(key: string, labels: string[]): Promise<void> {
    return this.exclusive(async () => {
      const posts = await this.read();
      if (posts[key]) throw new Error('Голосование уже существует.');
      posts[key] = { labels: [...labels], votes: {} };
      await this.save(posts);
    });
  }

  vote(key: string, userId: number, option: number,
    refresh: (post: VotingPost) => Promise<void>): Promise<boolean> {
    return this.exclusive(async () => {
      const posts = await this.read();
      const post = posts[key];
      if (!post || !Number.isInteger(option) || post.labels[option] === undefined) {
        throw new Error('Голосование или вариант не найден.');
      }
      const changed = post.votes[String(userId)] !== option;
      post.votes[String(userId)] = option;
      if (changed) await this.save(posts);
      // Refresh repeated votes too, so a failed Telegram edit can be retried.
      await refresh(post);
      return changed;
    });
  }
}
