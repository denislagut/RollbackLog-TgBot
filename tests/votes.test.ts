import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseLabels, VoteStore, votingKeyboard } from '../src/services/votes.js';

test('one vote per user, changing option, persistence and concurrent votes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tg-votes-'));
  try {
    const file = join(dir, 'votes.json');
    const store = new VoteStore(file);
    const key = '-100123_5';
    await store.create(key, ['Согласен', 'Не согласен']);
    const refresh = async () => {};
    assert.equal(await store.vote(key, 1, 0, refresh), true);
    assert.equal(await store.vote(key, 1, 0, refresh), false);
    assert.equal(await store.vote(key, 1, 1, refresh), true);
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.vote(key, i + 2, 0, refresh)));
    const restarted = new VoteStore(file);
    await restarted.vote(key, 1, 1, async (post) => {
      assert.equal(Object.keys(post.votes).length, 11);
      const keyboard = votingKeyboard(key, post).inline_keyboard.flat();
      assert.deepEqual(keyboard.map((button) => button.text), ['Согласен · 10', 'Не согласен · 1']);
      for (const button of keyboard) {
        if ('callback_data' in button) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
      }
    });
    await assert.rejects(restarted.vote(key, 1, 99, refresh));
    await assert.rejects(restarted.vote('missing', 1, 0, refresh));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a failed Telegram refresh does not lose the vote and can be retried', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tg-votes-'));
  try {
    const store = new VoteStore(join(dir, 'votes.json'));
    await store.create('post', ['Да', 'Нет']);
    await assert.rejects(store.vote('post', 3, 0, async () => { throw new Error('Network'); }));
    assert.equal(await store.vote('post', 3, 0, async (post) => {
      assert.equal(post.votes['3'], 0);
    }), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('button labels are trimmed and invalid options rejected', () => {
  assert.deepEqual(parseLabels(' Да | Нет '), ['Да', 'Нет']);
  for (const text of ['Да', 'Да |', 'Да | Да', `${'a'.repeat(41)} | Нет`, '1|2|3|4|5|6|7']) {
    assert.throws(() => parseLabels(text));
  }
});
