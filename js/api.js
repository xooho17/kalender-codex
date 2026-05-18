import { supabase } from './supabaseClient.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    // Session retrieval itself failed (corrupted local storage, malformed
    // token). Clear and force re-auth.
    await supabase.auth.signOut({ scope: 'local' });
    return null;
  }
  if (!data.session) return null;

  // getUser is a network call; it can transiently fail on flaky connections
  // and at app-resume time. Don't sign the user out for that — the cached
  // session.user is enough to keep them logged in until the next request
  // succeeds. Only treat an explicit "user not found" (no error, no user)
  // as a real logout signal.
  const { data: userData, error: userError } = await withTimeout(
    supabase.auth.getUser(),
    'Session check',
  ).catch((error) => ({ data: null, error }));
  if (!userError && userData?.user) {
    return { ...data.session, user: userData.user };
  }
  if (!userError && !userData?.user) {
    await supabase.auth.signOut({ scope: 'local' });
    return null;
  }
  return data.session;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

const SUPABASE_OP_TIMEOUT_MS = 10000;

async function withTimeout(promise, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out - check your connection, or sign out and back in to clear a stale session.`,
          ),
        ),
      SUPABASE_OP_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function pauseAutoRefresh() {
  try {
    supabase.auth.stopAutoRefresh();
  } catch (error) {
    console.warn('[auth] stopAutoRefresh threw', error);
  }
}

export function resumeAutoRefresh() {
  try {
    supabase.auth.startAutoRefresh();
  } catch (error) {
    console.warn('[auth] startAutoRefresh threw', error);
  }
}

export function resetRealtime() {
  try {
    supabase.realtime.disconnect();
  } catch (error) {
    console.warn('[realtime] disconnect threw', error);
  }
}

export async function fetchCalendars() {
  let { data, error } = await withTimeout(
    supabase
      .from('calendar_members')
      .select('role, calendars(id, name, color, owner_id, archived_at, created_at)'),
    'Load calendars',
  );

  if (error && error.message?.includes('archived_at')) {
    ({ data, error } = await withTimeout(
      supabase
        .from('calendar_members')
        .select('role, calendars(id, name, color, owner_id, created_at)'),
      'Load calendars',
    ));
  }

  if (error) throw error;
  const byId = new Map();
  data
    .map((row) => ({ archived_at: null, ...row.calendars, role: row.role }))
    .forEach((calendar) => {
      if (!calendar?.id || byId.has(calendar.id)) return;
      byId.set(calendar.id, calendar);
    });
  return [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function createCalendar({ name, color }) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await supabase
    .from('calendars')
    .insert({ name, color, owner_id: userData.user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCalendar(id) {
  const { error } = await supabase.from('calendars').delete().eq('id', id);
  if (error) throw error;
}

export async function updateCalendarArchive(id, archived) {
  const { data, error } = await supabase
    .from('calendars')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Returns every tag the signed-in user can see across all their member
// calendars. RLS does the filtering; no client-side filter required.
export async function fetchTags() {
  const { data, error } = await withTimeout(
    supabase
      .from('tags')
      .select('id, calendar_id, user_id, name, color, created_at, updated_at')
      .order('created_at', { ascending: true }),
    'Load tags',
  );

  if (error) throw error;
  return uniqueRowsById(data || []);
}

export async function createTag({ calendar_id, name, color }) {
  if (!calendar_id) throw new Error('A tag must belong to a calendar.');
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await supabase
    .from('tags')
    .insert({ calendar_id, name, color, user_id: userData.user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTag(id, { name, color }) {
  const { data, error } = await supabase
    .from('tags')
    .update({ name, color })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTag(id) {
  const { error } = await supabase.from('tags').delete().eq('id', id);
  if (error) throw error;
}

// Bulk-reassign every event using `fromTagId` to `toTagId`. Used by the
// delete-tag confirmation flow before the tag row is removed (the FK is
// `on delete restrict` after the cleanup migration, so this must succeed
// before deleteTag is called).
export async function reassignEventsTag(fromTagId, toTagId) {
  if (!fromTagId || !toTagId) throw new Error('Reassign requires both source and target tag ids.');
  const { data, error } = await supabase
    .from('events')
    .update({ tag_id: toTagId })
    .eq('tag_id', fromTagId)
    .select('id');

  if (error) throw error;
  return data || [];
}

// Authoritative count of events using a tag. The store has a client-side
// counter for quick UI feedback, but the confirmation modal calls this so
// the user sees the same number an admin would see in the database.
export async function countEventsUsingTag(tagId) {
  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('tag_id', tagId);
  if (error) throw error;
  return count || 0;
}

// Graceful fallback like fetchCalendars: if quick_add_templates is missing
// (migration not run yet) we resolve to [] rather than throw, so the rest of
// the app keeps working. Anything else still bubbles up.
export async function fetchQuickAddTemplates() {
  const { data, error } = await withTimeout(
    supabase
      .from('quick_add_templates')
      .select('*')
      .order('created_at', { ascending: true }),
    'Load quick-add templates',
  );
  if (error) {
    if (error.code === '42P01' || /quick_add_templates/i.test(error.message || '')) {
      return { rows: [], missingTable: true };
    }
    throw error;
  }
  return { rows: uniqueRowsById(data || []), missingTable: false };
}

export async function createQuickAddTemplate(payload) {
  let { data, error } = await supabase
    .from('quick_add_templates')
    .insert(payload)
    .select()
    .single();
  if (isMissingQuickAddStartColumn(error)) {
    if (payload.default_start_time) throw missingQuickAddStartMigrationError();
    ({ data, error } = await supabase
      .from('quick_add_templates')
      .insert(withoutQuickAddStartTime(payload))
      .select()
      .single());
  }
  if (error) throw error;
  return data;
}

export async function fetchProfile(user) {
  if (!user?.id) return null;
  let { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('id', user.id)
      .maybeSingle(),
    'Load profile',
  );

  if (isMissingProfileDisplayNameColumn(error)) {
    ({ data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id, email')
        .eq('id', user.id)
        .maybeSingle(),
      'Load profile',
    ));
    if (error) throw error;
    return {
      id: user.id,
      email: data?.email || user.email || '',
      display_name: null,
      missingDisplayName: true,
    };
  }

  if (error) throw error;
  return normalizeProfile({
    id: user.id,
    email: data?.email || user.email || '',
    display_name: data?.display_name || null,
    missingDisplayName: false,
  });
}

export async function updateProfileDisplayName(displayName) {
  const { data, error } = await supabase.rpc('set_profile_display_name', {
    display_name: displayName?.trim() || null,
  });

  if (error) {
    if (
      isMissingProfileDisplayNameColumn(error) ||
      /set_profile_display_name|function/i.test(error.message || '')
    ) {
      throw missingProfileDisplayNameMigrationError();
    }
    throw error;
  }
  return normalizeProfile(data);
}

export async function updateQuickAddTemplate(id, payload) {
  let { data, error } = await supabase
    .from('quick_add_templates')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (isMissingQuickAddStartColumn(error)) {
    if (payload.default_start_time) throw missingQuickAddStartMigrationError();
    ({ data, error } = await supabase
      .from('quick_add_templates')
      .update(withoutQuickAddStartTime(payload))
      .eq('id', id)
      .select()
      .single());
  }
  if (error) throw error;
  return data;
}

export async function deleteQuickAddTemplate(id) {
  const { error } = await supabase.from('quick_add_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function shareCalendar({ calendar_id, email, role }) {
  const { data, error } = await supabase
    .rpc('share_calendar_by_email', {
      target_calendar_id: calendar_id,
      target_email: email,
      target_role: role,
    });

  if (error) throw error;
  return data;
}

export async function fetchEvents(calendarIds, rangeStart, rangeEnd) {
  if (!calendarIds.length) return [];

  const { data, error } = await withTimeout(
    supabase
      .from('events')
      .select('*')
      .in('calendar_id', calendarIds)
      .lte('starts_at', rangeEnd.toISOString())
      .gte('ends_at', rangeStart.toISOString())
      .order('starts_at', { ascending: true }),
    'Load events',
  );

  if (error) throw error;
  return withCreatorProfiles(uniqueRowsById(data || []));
}

async function withCreatorProfiles(events) {
  const eventIds = events.map((event) => event.id).filter(Boolean);
  if (!eventIds.length) return events;

  try {
    const { data, error } = await withTimeout(
      supabase.rpc('event_creator_profiles', {
        target_event_ids: eventIds,
      }),
      'Load event creators',
    );
    if (error) throw error;
    const profileById = new Map((data || []).map((profile) => [profile.id, profile]));
    return events.map((event) => ({
      ...event,
      creator_email: event.created_by ? profileById.get(event.created_by)?.email || null : null,
      creator_display_name: event.created_by
        ? profileById.get(event.created_by)?.display_name || null
        : null,
    }));
  } catch (error) {
    if (!/event_creator_profiles|function/i.test(error.message || '')) {
      console.warn('[events] creator profile lookup failed', error);
    }
    return events;
  }
}

function uniqueRowsById(rows) {
  const byId = new Map();
  rows.forEach((row) => {
    if (!row?.id || byId.has(row.id)) return;
    byId.set(row.id, row);
  });
  return [...byId.values()];
}

function normalizeProfile(profile) {
  const row = Array.isArray(profile) ? profile[0] : profile;
  if (!row) return null;
  return {
    ...row,
    display_name: row.display_name || null,
    missingDisplayName: Boolean(row.missingDisplayName),
  };
}

function isMissingQuickAddStartColumn(error) {
  return Boolean(error && /default_start_time|column/i.test(error.message || ''));
}

function isMissingProfileDisplayNameColumn(error) {
  return Boolean(error && /display_name|column/i.test(error.message || ''));
}

function isMissingSharedWithAllColumn(error) {
  return Boolean(error && /shared_with_all|column/i.test(error.message || ''));
}

function withoutQuickAddStartTime(payload) {
  const { default_start_time, ...rest } = payload;
  return rest;
}

function withoutSharedWithAll(payload) {
  const { shared_with_all, ...rest } = payload;
  return rest;
}

function missingQuickAddStartMigrationError() {
  return new Error(
    'Run supabase/2026-05-quick-add-start-and-event-creators.sql to enable Custom Quick Add start times.',
  );
}

function missingProfileDisplayNameMigrationError() {
  return new Error('Run supabase/2026-05-profile-display-names.sql to enable nicknames.');
}

function missingSharedWithAllMigrationError() {
  return new Error('Run supabase/2026-05-shared-events.sql to enable shared collaborator events.');
}

export async function saveEvent(event) {
  if (!event.tag_id) throw new Error('Pick a tag before saving the event.');
  const payload = {
    calendar_id: event.calendar_id,
    title: event.title,
    description: event.description,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    tag_id: event.tag_id,
    reminder_minutes: event.reminder_minutes,
    completed: Boolean(event.completed),
    shared_with_all: Boolean(event.shared_with_all),
  };

  if (event.id) {
    let { data, error } = await withTimeout(saveEventQuery(payload, event.id), 'Save');
    if (isMissingSharedWithAllColumn(error)) {
      if (event.shared_with_all) throw missingSharedWithAllMigrationError();
      ({ data, error } = await withTimeout(saveEventQuery(withoutSharedWithAll(payload), event.id), 'Save'));
    }
    if (error) throw error;
    return data;
  }

  let { data, error } = await withTimeout(saveEventQuery(payload), 'Save');
  if (isMissingSharedWithAllColumn(error)) {
    if (event.shared_with_all) throw missingSharedWithAllMigrationError();
    ({ data, error } = await withTimeout(saveEventQuery(withoutSharedWithAll(payload)), 'Save'));
  }

  if (error) throw error;
  return data;
}

function saveEventQuery(payload, id = null) {
  const query = id
    ? supabase.from('events').update(payload).eq('id', id)
    : supabase.from('events').insert(payload);
  return query.select().single();
}

export async function deleteEvent(id) {
  const { error } = await withTimeout(supabase.from('events').delete().eq('id', id), 'Delete');
  if (error) throw error;
}

export async function setEventCompleted(id, completed) {
  const { data, error } = await withTimeout(
    supabase.from('events').update({ completed }).eq('id', id).select().single(),
    'Update',
  );

  if (error) throw error;
  return data;
}

// Subscribe to both events and tag changes for the visible calendar set.
// One channel, one listener per (table, calendar_id) pair. Returns the
// channel so the caller can pass it to removeChannel later.
export function subscribeToWorkspace(calendarIds, callbacks) {
  if (!calendarIds.length) return null;

  const channel = supabase.channel(`workspace:${calendarIds.sort().join(',')}`);

  calendarIds.forEach((calendarId) => {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'events',
        filter: `calendar_id=eq.${calendarId}`,
      },
      callbacks.onEventChange,
    );
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tags',
        filter: `calendar_id=eq.${calendarId}`,
      },
      callbacks.onTagChange,
    );
  });

  channel.subscribe();

  return channel;
}

export async function removeChannel(channel) {
  if (channel) await supabase.removeChannel(channel);
}
