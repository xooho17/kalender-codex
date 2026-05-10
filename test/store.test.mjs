// Store-layer tests: tag-by-calendar selectors, the visible-event filter,
// and the syncSelectedTags re-seed behavior. No DOM, no Supabase — just the
// in-memory state object.
import { strict as assert } from 'node:assert';
import { beforeEach, test } from 'node:test';
import {
  canEditCalendar,
  defaultTagFor,
  eventTag,
  findFreeTimeSlots,
  findQuickAddTemplateByShortcut,
  findTag,
  state,
  syncSelectedTags,
  tagsForCalendar,
  visibleEvents,
  visibleFocusArchiveEvents,
  visibleFocusEvents,
  visibleMonthEvents,
  visibleTags,
} from '../js/store.js';

const calA = { id: 'cal-a', name: 'A', color: '#aaaaaa', role: 'owner' };
const calB = { id: 'cal-b', name: 'B', color: '#bbbbbb', role: 'collaborator' };
const calC = { id: 'cal-c', name: 'C', color: '#cccccc', role: 'viewer' };
const calArch = { id: 'cal-arch', name: 'Arch', color: '#dddddd', role: 'owner', archived_at: '2026-04-01T00:00:00Z' };

const tagA1 = { id: 't-a-untagged', calendar_id: 'cal-a', name: 'Untagged', color: '#94a3b8' };
const tagA2 = { id: 't-a-work',     calendar_id: 'cal-a', name: 'Work',     color: '#3b82f6' };
const tagB1 = { id: 't-b-untagged', calendar_id: 'cal-b', name: 'Untagged', color: '#94a3b8' };
const tagB2 = { id: 't-b-personal', calendar_id: 'cal-b', name: 'Personal', color: '#22c55e' };
const tagC1 = { id: 't-c-untagged', calendar_id: 'cal-c', name: 'Untagged', color: '#94a3b8' };

beforeEach(() => {
  state.calendars = [calA, calB, calC, calArch];
  state.tags = [tagA1, tagA2, tagB1, tagB2, tagC1];
  state.events = [];
  state.session = { user: { id: 'user-me', email: 'me@example.com' } };
  state.activeCalendarId = null;
  state.monthEntryScope = 'mine';
  state.focusView = 'focus';
  state.search = '';
  state.showArchivedCalendars = false;
  state.selectedTagIds = new Set();
  state.quickAddTemplates = [];
});

test('canEditCalendar — owner and collaborator yes, viewer / unknown no', () => {
  assert.ok(canEditCalendar('cal-a'));
  assert.ok(canEditCalendar('cal-b'));
  assert.ok(!canEditCalendar('cal-c'));
  // For an unknown id the function short-circuits to a falsy value (currently
  // `undefined`); callers only depend on truthiness.
  assert.ok(!canEditCalendar('cal-missing'));
});

test('tagsForCalendar — only that calendar\'s tags, never bleed across', () => {
  assert.deepEqual(
    tagsForCalendar('cal-a').map((t) => t.id),
    [tagA1.id, tagA2.id],
  );
  assert.deepEqual(
    tagsForCalendar('cal-b').map((t) => t.id),
    [tagB1.id, tagB2.id],
  );
  assert.deepEqual(tagsForCalendar(null), []);
  assert.deepEqual(tagsForCalendar(undefined), []);
});

test('findTag returns the row or null, regardless of calendar scope', () => {
  assert.equal(findTag('t-a-work'), tagA2);
  assert.equal(findTag('t-b-personal'), tagB2);
  assert.equal(findTag('nope'), null);
  assert.equal(findTag(null), null);
});

test('defaultTagFor returns the calendar\'s Untagged row', () => {
  assert.equal(defaultTagFor('cal-a'), tagA1);
  assert.equal(defaultTagFor('cal-b'), tagB1);
  assert.equal(defaultTagFor(null), null);
  assert.equal(defaultTagFor('cal-missing'), null);
});

test('defaultTagFor falls back to first tag if Untagged is missing', () => {
  state.tags = [tagA2]; // no Untagged for cal-a
  assert.equal(defaultTagFor('cal-a'), tagA2);
});

test('eventTag — normal lookup', () => {
  const event = { tag_id: 't-b-personal' };
  assert.equal(eventTag(event), tagB2);
});

test('eventTag — unknown tag falls back to a frozen FALLBACK row', () => {
  const event = { tag_id: 'tag-deleted-mid-flight' };
  const fb = eventTag(event);
  assert.equal(fb.fallback, true);
  assert.equal(fb.id, null);
  assert.equal(fb.name, 'Untagged');
});

test('visibleTags — when active calendar set, returns only that calendar\'s tags', () => {
  state.activeCalendarId = 'cal-a';
  assert.deepEqual(
    visibleTags().map((t) => t.id),
    [tagA1.id, tagA2.id],
  );
});

test('visibleTags — no active calendar, union over visible (non-archived) calendars', () => {
  // archived calendar's tags should not show by default
  state.tags = [...state.tags, { id: 't-arch', calendar_id: 'cal-arch', name: 'Foo', color: '#000000' }];
  const visible = visibleTags().map((t) => t.id);
  assert.equal(visible.includes('t-arch'), false);
});

test('visibleTags — showArchivedCalendars includes archived', () => {
  state.tags = [...state.tags, { id: 't-arch', calendar_id: 'cal-arch', name: 'Foo', color: '#000000' }];
  state.showArchivedCalendars = true;
  const visible = visibleTags().map((t) => t.id);
  assert.equal(visible.includes('t-arch'), true);
});

test('syncSelectedTags — drops invalid ids, adds new visible ones (auto-check)', () => {
  state.selectedTagIds = new Set(['t-old-deleted']);
  syncSelectedTags();
  assert.equal(state.selectedTagIds.has('t-old-deleted'), false);
  // every visible tag is now checked (default state: nothing hidden)
  assert.equal(state.selectedTagIds.has(tagA1.id), true);
  assert.equal(state.selectedTagIds.has(tagB2.id), true);
});

test('syncSelectedTags — switching active calendar narrows the visible set', () => {
  state.activeCalendarId = 'cal-a';
  syncSelectedTags();
  // Only cal-a tags are now in the selection
  assert.deepEqual(
    [...state.selectedTagIds].sort(),
    [tagA1.id, tagA2.id].sort(),
  );
});

test('visibleEvents — filters by active calendar', () => {
  state.events = [
    { id: 'e1', calendar_id: 'cal-a', title: 'In A', description: '', tag_id: tagA1.id },
    { id: 'e2', calendar_id: 'cal-b', title: 'In B', description: '', tag_id: tagB1.id },
  ];
  state.activeCalendarId = 'cal-a';
  syncSelectedTags();
  assert.deepEqual(visibleEvents().map((e) => e.id), ['e1']);
});

test('visibleEvents — search matches title or description, case-insensitive', () => {
  state.events = [
    { id: 'e1', calendar_id: 'cal-a', title: 'Sprint planning', description: '', tag_id: tagA1.id },
    { id: 'e2', calendar_id: 'cal-a', title: 'Lunch', description: 'with the SPRINT crew', tag_id: tagA1.id },
    { id: 'e3', calendar_id: 'cal-a', title: 'Other', description: '', tag_id: tagA1.id },
  ];
  syncSelectedTags();
  state.search = 'sprint';
  assert.deepEqual(visibleEvents().map((e) => e.id).sort(), ['e1', 'e2']);
});

test('visibleEvents — events with NO tag_id bypass the tag filter', () => {
  state.events = [
    { id: 'e1', calendar_id: 'cal-a', title: 'Tagless', description: '', tag_id: null },
  ];
  state.selectedTagIds = new Set([tagA1.id]);
  // !event.tag_id short-circuits the filter so transient untagged rows
  // (during the migration window or realtime races) don't vanish from the UI.
  assert.equal(visibleEvents().length, 1);
});

test('visibleEvents — event whose tag_id is set but unknown to state IS hidden when filters are active', () => {
  state.events = [
    { id: 'e1', calendar_id: 'cal-a', title: 'Stale', description: '', tag_id: 'tag-deleted' },
  ];
  state.selectedTagIds = new Set([tagA1.id]);
  // After the cleanup migration the FK is `on delete restrict`, so this state
  // shouldn't occur — but if it does, the filter behaves predictably (hidden).
  assert.equal(visibleEvents().length, 0);
});

test('findQuickAddTemplateByShortcut — case-insensitive', () => {
  state.quickAddTemplates = [
    { id: 'q1', shortcut: 'work', default_title: 'Work', default_duration_minutes: 60 },
  ];
  assert.equal(findQuickAddTemplateByShortcut('WORK')?.id, 'q1');
  assert.equal(findQuickAddTemplateByShortcut('Work')?.id, 'q1');
  assert.equal(findQuickAddTemplateByShortcut('gym'), null);
  assert.equal(findQuickAddTemplateByShortcut(''), null);
});

test('visibleMonthEvents - mine scope is the default', () => {
  state.events = [
    { id: 'e1', calendar_id: 'cal-a', title: 'Mine', description: '', tag_id: tagA1.id, created_by: 'user-me' },
    { id: 'e2', calendar_id: 'cal-a', title: 'Other', description: '', tag_id: tagA1.id, created_by: 'user-other' },
  ];
  syncSelectedTags();
  assert.deepEqual(visibleMonthEvents().map((e) => e.id), ['e1']);
});

test('visibleMonthEvents - all scope shows every collaborator entry', () => {
  state.events = [
    { id: 'e1', calendar_id: 'cal-a', title: 'Mine', description: '', tag_id: tagA1.id, created_by: 'user-me' },
    { id: 'e2', calendar_id: 'cal-a', title: 'Other', description: '', tag_id: tagA1.id, created_by: 'user-other' },
  ];
  state.monthEntryScope = 'all';
  syncSelectedTags();
  assert.deepEqual(visibleMonthEvents().map((e) => e.id), ['e1', 'e2']);
});

test('visibleMonthEvents - mine scope only shows entries created by the signed-in user', () => {
  state.events = [
    { id: 'e1', calendar_id: 'cal-a', title: 'Mine', description: '', tag_id: tagA1.id, created_by: 'user-me' },
    { id: 'e2', calendar_id: 'cal-a', title: 'Other', description: '', tag_id: tagA1.id, created_by: 'user-other' },
    { id: 'e3', calendar_id: 'cal-a', title: 'Unknown', description: '', tag_id: tagA1.id, created_by: null },
  ];
  state.monthEntryScope = 'mine';
  syncSelectedTags();
  assert.deepEqual(visibleMonthEvents().map((e) => e.id), ['e1']);
});

test('visibleMonthEvents - others scope only shows collaborator entries with a known creator', () => {
  state.events = [
    { id: 'e1', calendar_id: 'cal-a', title: 'Mine', description: '', tag_id: tagA1.id, created_by: 'user-me' },
    { id: 'e2', calendar_id: 'cal-a', title: 'Other', description: '', tag_id: tagA1.id, created_by: 'user-other' },
    { id: 'e3', calendar_id: 'cal-a', title: 'Unknown', description: '', tag_id: tagA1.id, created_by: null },
  ];
  state.monthEntryScope = 'others';
  syncSelectedTags();
  assert.deepEqual(visibleMonthEvents().map((e) => e.id), ['e2']);
});

test('visibleFocusEvents hides past events but keeps open overdue tasks', () => {
  const now = new Date('2026-05-07T12:00:00');
  state.events = [
    {
      id: 'past-event',
      calendar_id: 'cal-a',
      title: 'Past event',
      description: '',
      tag_id: tagA1.id,
      starts_at: '2026-05-07T08:00:00',
      ends_at: '2026-05-07T09:00:00',
    },
    {
      id: 'future-event',
      calendar_id: 'cal-a',
      title: 'Future event',
      description: '',
      tag_id: tagA1.id,
      starts_at: '2026-05-07T15:00:00',
      ends_at: '2026-05-07T16:00:00',
    },
    {
      id: 'open-old-task',
      calendar_id: 'cal-a',
      title: 'Task: overdue',
      description: '',
      tag_id: tagA1.id,
      starts_at: '2026-04-28T10:00:00',
      ends_at: '2026-04-28T11:00:00',
      completed: false,
    },
  ];
  syncSelectedTags();
  assert.deepEqual(visibleFocusEvents(now).map((e) => e.id), ['open-old-task', 'future-event']);
});

test('visibleFocusArchiveEvents contains past events and old completed tasks', () => {
  const now = new Date('2026-05-07T12:00:00');
  state.events = [
    {
      id: 'past-event',
      calendar_id: 'cal-a',
      title: 'Past event',
      description: '',
      tag_id: tagA1.id,
      starts_at: '2026-05-07T08:00:00',
      ends_at: '2026-05-07T09:00:00',
    },
    {
      id: 'old-done-task',
      calendar_id: 'cal-a',
      title: 'Task: done',
      description: '',
      tag_id: tagA1.id,
      starts_at: '2026-04-28T10:00:00',
      ends_at: '2026-04-28T11:00:00',
      completed: true,
    },
    {
      id: 'current-done-task',
      calendar_id: 'cal-a',
      title: 'Task: current done',
      description: '',
      tag_id: tagA1.id,
      starts_at: '2026-05-06T10:00:00',
      ends_at: '2026-05-06T11:00:00',
      completed: true,
    },
  ];
  syncSelectedTags();
  assert.deepEqual(
    visibleFocusArchiveEvents(now).map((e) => e.id).sort(),
    ['old-done-task', 'past-event'].sort(),
  );
});

test('findFreeTimeSlots returns gaps across busy events', () => {
  const slots = findFreeTimeSlots(
    [
      {
        id: 'busy-1',
        starts_at: '2026-05-11T09:30:00',
        ends_at: '2026-05-11T10:30:00',
      },
      {
        id: 'busy-2',
        starts_at: '2026-05-11T12:00:00',
        ends_at: '2026-05-11T13:00:00',
      },
    ],
    {
      startDate: new Date('2026-05-11T00:00:00'),
      days: 1,
      durationMinutes: 60,
      windowStartMinutes: 9 * 60,
      windowEndMinutes: 14 * 60,
      maxSlots: 4,
      stepMinutes: 30,
    },
  );

  assert.deepEqual(
    slots.map((slot) => [new Date(slot.starts_at).getHours(), new Date(slot.starts_at).getMinutes()]),
    [
      [13, 0],
      [10, 30],
      [11, 0],
    ],
  );
});

test('findFreeTimeSlots limits each day to three slots and prefers 13-18', () => {
  const slots = findFreeTimeSlots([], {
    startDate: new Date('2026-05-11T00:00:00'),
    days: 2,
    durationMinutes: 60,
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 19 * 60,
    stepMinutes: 60,
  });

  assert.equal(slots.length, 6);
  assert.deepEqual(
    slots.map((slot) => [
      new Date(slot.starts_at).getDate(),
      new Date(slot.starts_at).getHours(),
    ]),
    [
      [11, 13],
      [11, 14],
      [11, 15],
      [12, 13],
      [12, 14],
      [12, 15],
    ],
  );
});

test('findFreeTimeSlots ignores completed busy items', () => {
  const slots = findFreeTimeSlots(
    [
      {
        id: 'done',
        starts_at: '2026-05-11T09:00:00',
        ends_at: '2026-05-11T10:00:00',
        completed: true,
      },
    ],
    {
      startDate: new Date('2026-05-11T00:00:00'),
      days: 1,
      durationMinutes: 60,
      windowStartMinutes: 9 * 60,
      windowEndMinutes: 11 * 60,
      maxSlots: 2,
      stepMinutes: 30,
    },
  );

  assert.equal(slots.length, 2);
  assert.equal(new Date(slots[0].starts_at).getHours(), 9);
});
