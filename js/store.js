import { FALLBACK_TAG_COLOR, FALLBACK_TAG_NAME } from './config.js';

export const state = {
  session: null,
  calendars: [],
  activeCalendarId: null,
  events: [],
  tags: [],
  quickAddTemplates: [],
  selectedDate: new Date(),
  dayDetailDate: null,
  view: 'month',
  monthEntryScope: 'mine',
  focusView: 'focus',
  search: '',
  showArchivedCalendars: false,
  selectedTagIds: new Set(),
  realtimeChannel: null,
  freeTimeSlots: [],
  freeTimeStatus: 'Find open slots across your visible calendars.',
  freeTimeQuery: null,
  freeTimeResultsOpen: false,
};

const FALLBACK_TAG = Object.freeze({
  id: null,
  name: FALLBACK_TAG_NAME,
  color: FALLBACK_TAG_COLOR,
  calendar_id: null,
  fallback: true,
});

export function canEditCalendar(calendarId) {
  const calendar = state.calendars.find((item) => item.id === calendarId);
  return calendar && ['owner', 'collaborator'].includes(calendar.role);
}

export function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// Tags loaded for the user across every calendar they're a member of. Pickers
// must consume tagsForCalendar(calendarId) — never the full list — so an event
// in calendar A can never be saved with a tag from calendar B.
export function tagsForCalendar(calendarId) {
  if (!calendarId) return [];
  return uniqueById(state.tags.filter((tag) => tag.calendar_id === calendarId));
}

// Find a tag by id across every loaded calendar. Used for rendering existing
// events whose tag may live in a different calendar than the active one.
export function findTag(tagId) {
  if (!tagId) return null;
  return state.tags.find((tag) => tag.id === tagId) || null;
}

export function eventTag(event) {
  return findTag(event.tag_id) || FALLBACK_TAG;
}

// Find the per-calendar default ("Untagged") for fallbacks during create.
// Created automatically by the seed_calendar_tags trigger; this lookup is
// defensive in case the migration hasn't run yet.
export function defaultTagFor(calendarId) {
  if (!calendarId) return null;
  return (
    state.tags.find(
      (tag) => tag.calendar_id === calendarId && tag.name === FALLBACK_TAG_NAME,
    ) || tagsForCalendar(calendarId)[0] || null
  );
}

// Visible-tag set: union of tags across calendars currently shown. Used to
// re-seed selectedTagIds after a calendar list/active-calendar change.
export function visibleTags() {
  const visibleCalendarIds = new Set(
    state.calendars
      .filter((calendar) => !calendar.archived_at || state.showArchivedCalendars)
      .map((calendar) => calendar.id),
  );
  if (state.activeCalendarId) {
    return tagsForCalendar(state.activeCalendarId);
  }
  return uniqueById(state.tags.filter((tag) => visibleCalendarIds.has(tag.calendar_id)));
}

export function isTaskEvent(event) {
  return Boolean(event?.completed || event?.title?.toLowerCase().startsWith('task:'));
}

export function visibleMonthEvents() {
  const userId = state.session?.user?.id;
  if (state.monthEntryScope === 'mine') {
    return visibleEvents().filter((event) => userId && event.created_by === userId);
  }
  if (state.monthEntryScope === 'others') {
    return visibleEvents().filter((event) => userId && event.created_by && event.created_by !== userId);
  }
  return visibleEvents();
}

export function visibleFocusEvents(referenceDate = new Date()) {
  const weekStart = startOfLocalWeek(referenceDate);
  const weekEnd = addLocalDays(weekStart, 7);
  return visibleEvents()
    .filter((event) => {
      if (isArchivedFocusEvent(event, referenceDate)) return false;
      const start = new Date(event.starts_at);
      const isTask = isTaskEvent(event);
      return isTask || (start >= weekStart && start < weekEnd);
    })
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

export function visibleFocusArchiveEvents(referenceDate = new Date()) {
  return visibleEvents()
    .filter((event) => isArchivedFocusEvent(event, referenceDate))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
}

export function isArchivedFocusEvent(event, referenceDate = new Date()) {
  const weekStart = startOfLocalWeek(referenceDate);
  if (isTaskEvent(event)) {
    return Boolean(event.completed && new Date(event.starts_at) < weekStart);
  }
  return new Date(event.ends_at) < referenceDate;
}

export function findFreeTimeSlots(events, options) {
  const {
    startDate,
    days,
    durationMinutes,
    windowStartMinutes,
    windowEndMinutes,
    maxSlots = 12,
    stepMinutes = 30,
  } = options;

  const durationMs = durationMinutes * 60 * 1000;
  const stepMs = stepMinutes * 60 * 1000;
  const slots = [];

  for (let dayIndex = 0; dayIndex < days && slots.length < maxSlots; dayIndex += 1) {
    const day = addLocalDays(startOfLocalDay(startDate), dayIndex);
    const windowStart = dateAtMinutes(day, windowStartMinutes);
    const windowEnd = dateAtMinutes(day, windowEndMinutes);
    const busy = events
      .filter((event) => !event.completed)
      .map((event) => ({
        start: new Date(event.starts_at),
        end: new Date(event.ends_at),
      }))
      .filter((event) => event.start < windowEnd && event.end > windowStart)
      .map((event) => ({
        start: new Date(Math.max(event.start.getTime(), windowStart.getTime())),
        end: new Date(Math.min(event.end.getTime(), windowEnd.getTime())),
      }))
      .sort((a, b) => a.start - b.start);

    const merged = [];
    busy.forEach((event) => {
      const last = merged[merged.length - 1];
      if (!last || event.start > last.end) {
        merged.push({ ...event });
      } else if (event.end > last.end) {
        last.end = event.end;
      }
    });

    let cursor = new Date(windowStart);
    [...merged, { start: windowEnd, end: windowEnd }].forEach((block) => {
      while (block.start.getTime() - cursor.getTime() >= durationMs && slots.length < maxSlots) {
        const start = new Date(cursor);
        const end = new Date(start.getTime() + durationMs);
        slots.push({
          id: `slot-${start.getTime()}`,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          calendar_count: options.calendarCount || 0,
        });
        cursor = new Date(cursor.getTime() + stepMs);
      }
      if (block.end > cursor) cursor = new Date(block.end);
    });
  }

  return slots;
}

function startOfLocalDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateAtMinutes(date, minutes) {
  const next = startOfLocalDay(date);
  next.setMinutes(minutes);
  return next;
}

function startOfLocalWeek(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function addLocalDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Re-sync selectedTagIds with whatever tags are currently visible. Called any
// time tags or active calendar changes; keeps the filter in a sane state.
export function syncSelectedTags() {
  const validIds = new Set(visibleTags().map((tag) => tag.id));
  // Drop now-invalid ids and ensure new ones default to "checked" so newly
  // visible tags don't silently hide their events.
  state.selectedTagIds.forEach((id) => {
    if (!validIds.has(id)) state.selectedTagIds.delete(id);
  });
  validIds.forEach((id) => state.selectedTagIds.add(id));
}

export function findQuickAddTemplateByShortcut(shortcut) {
  if (!shortcut) return null;
  const needle = shortcut.toLowerCase();
  return (
    state.quickAddTemplates.find((template) => template.shortcut.toLowerCase() === needle) || null
  );
}

// Events filtered by the active calendar / tag-filter chips / search box.
// This is the canonical filter — every render site goes through it so adding
// a new filter dimension only has to be done in one place.
export function visibleEvents() {
  const query = state.search.trim().toLowerCase();
  return state.events.filter((event) => {
    const matchesCalendar =
      !state.activeCalendarId || event.calendar_id === state.activeCalendarId;
    // Events with no tag_id at all (transient, in the brief window before the
    // cleanup migration makes the column NOT NULL, or during a realtime/fetch
    // race) bypass the tag filter so they don't vanish from the UI.
    const matchesTag =
      !event.tag_id || state.selectedTagIds.size === 0 || state.selectedTagIds.has(event.tag_id);
    const matchesSearch =
      !query ||
      event.title.toLowerCase().includes(query) ||
      (event.description || '').toLowerCase().includes(query);
    return matchesCalendar && matchesTag && matchesSearch;
  });
}
