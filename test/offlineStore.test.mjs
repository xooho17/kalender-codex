import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyQueuedEventMutations,
  compactQueuedMutations,
  isLocalEventId,
  replaceQueuedEventId,
} from '../js/offlineStore.js';

test('compactQueuedMutations keeps only the latest offline save per event', () => {
  const queue = compactQueuedMutations([
    {
      type: 'saveEvent',
      client_id: 'event-1',
      event: { id: 'event-1', title: 'Old', starts_at: '2026-05-19T10:00:00.000Z' },
    },
    {
      type: 'saveEvent',
      client_id: 'event-1',
      event: { id: 'event-1', title: 'New', starts_at: '2026-05-19T11:00:00.000Z' },
    },
  ]);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].event.title, 'New');
  assert.equal(queue[0].event.starts_at, '2026-05-19T11:00:00.000Z');
});

test('compactQueuedMutations drops unsynced local creates when deleted offline', () => {
  const queue = compactQueuedMutations([
    {
      type: 'saveEvent',
      client_id: 'tmp-1',
      event: { id: 'tmp-1', title: 'Draft', starts_at: '2026-05-19T10:00:00.000Z' },
    },
    { type: 'deleteEvent', event_id: 'tmp-1' },
  ]);

  assert.deepEqual(queue, []);
});

test('applyQueuedEventMutations overlays saves and deletes on fetched events', () => {
  const events = [
    { id: 'event-1', title: 'Keep', starts_at: '2026-05-19T10:00:00.000Z' },
    { id: 'event-2', title: 'Delete me', starts_at: '2026-05-19T11:00:00.000Z' },
  ];
  const queue = [
    {
      type: 'saveEvent',
      client_id: 'event-1',
      event: { id: 'event-1', title: 'Changed', starts_at: '2026-05-19T10:00:00.000Z' },
    },
    {
      type: 'saveEvent',
      client_id: 'tmp-1',
      event: { id: 'tmp-1', title: 'Local', starts_at: '2026-05-19T09:00:00.000Z' },
    },
    { type: 'deleteEvent', event_id: 'event-2' },
  ];

  assert.deepEqual(
    applyQueuedEventMutations(events, queue).map((event) => [event.id, event.title]),
    [
      ['tmp-1', 'Local'],
      ['event-1', 'Changed'],
    ],
  );
});

test('replaceQueuedEventId remaps later offline saves after create sync', () => {
  const queue = replaceQueuedEventId(
    [
      {
        type: 'saveEvent',
        client_id: 'tmp-1',
        event: { id: 'tmp-1', title: 'Changed', starts_at: '2026-05-19T10:00:00.000Z' },
      },
    ],
    'tmp-1',
    'server-1',
  );

  assert.equal(queue[0].client_id, 'server-1');
  assert.equal(queue[0].event.id, 'server-1');
});

test('replaceQueuedEventId remaps later offline deletes after create sync', () => {
  const queue = replaceQueuedEventId([{ type: 'deleteEvent', event_id: 'tmp-1' }], 'tmp-1', 'server-1');

  assert.equal(queue[0].event_id, 'server-1');
});

test('isLocalEventId detects temporary event ids', () => {
  assert.equal(isLocalEventId('tmp-123'), true);
  assert.equal(isLocalEventId('offline-123'), true);
  assert.equal(isLocalEventId('server-123'), false);
});
