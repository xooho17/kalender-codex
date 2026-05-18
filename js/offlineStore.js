const WORKSPACE_KEY_PREFIX = 'kalender-offline-workspace-v1:';
const QUEUE_KEY_PREFIX = 'kalender-offline-queue-v1:';

export function readOfflineWorkspace(userId) {
  if (!userId) return null;
  return normalizeWorkspace(readJson(workspaceKey(userId)));
}

export function writeOfflineWorkspace(userId, workspace) {
  if (!userId || !workspace) return;
  writeJson(workspaceKey(userId), {
    version: 1,
    cached_at: new Date().toISOString(),
    profile: workspace.profile || null,
    calendars: Array.isArray(workspace.calendars) ? workspace.calendars : [],
    tags: Array.isArray(workspace.tags) ? workspace.tags : [],
    quickAddTemplates: Array.isArray(workspace.quickAddTemplates)
      ? workspace.quickAddTemplates
      : [],
    events: sortEvents(Array.isArray(workspace.events) ? workspace.events : []),
    activeCalendarId: workspace.activeCalendarId || null,
  });
}

export function readOfflineQueue(userId) {
  if (!userId) return [];
  const queue = readJson(queueKey(userId));
  return Array.isArray(queue) ? compactQueuedMutations(queue) : [];
}

export function writeOfflineQueue(userId, queue) {
  if (!userId) return;
  writeJson(queueKey(userId), compactQueuedMutations(queue));
}

export function enqueueOfflineMutation(userId, mutation) {
  const queue = [
    ...readOfflineQueue(userId),
    {
      ...mutation,
      queue_id: mutation.queue_id || makeQueueId(),
      queued_at: mutation.queued_at || new Date().toISOString(),
    },
  ];
  writeOfflineQueue(userId, queue);
  return readOfflineQueue(userId);
}

export function applyQueuedEventMutations(events, queue) {
  const byId = new Map((events || []).filter((event) => event?.id).map((event) => [event.id, event]));

  compactQueuedMutations(queue).forEach((mutation) => {
    if (mutation.type === 'saveEvent' && mutation.event) {
      const id = mutation.client_id || mutation.event.id;
      if (id) byId.set(id, { ...mutation.event, id });
      return;
    }
    if (mutation.type === 'deleteEvent' && mutation.event_id) {
      byId.delete(mutation.event_id);
    }
  });

  return sortEvents([...byId.values()]);
}

export function compactQueuedMutations(queue) {
  const compacted = [];

  (queue || []).forEach((mutation) => {
    if (mutation?.type === 'saveEvent' && mutation.event) {
      const id = mutation.client_id || mutation.event.id;
      if (!id) return;
      const normalized = {
        ...mutation,
        client_id: id,
        event: { ...mutation.event, id },
      };
      const previousSaveIndex = compacted.findIndex(
        (item) => item.type === 'saveEvent' && (item.client_id || item.event?.id) === id,
      );
      if (previousSaveIndex !== -1) {
        compacted[previousSaveIndex] = {
          ...compacted[previousSaveIndex],
          event: {
            ...compacted[previousSaveIndex].event,
            ...normalized.event,
          },
          queued_at: normalized.queued_at,
        };
        return;
      }
      compacted.push(normalized);
      return;
    }

    if (mutation?.type === 'deleteEvent' && mutation.event_id) {
      const id = mutation.event_id;
      for (let index = compacted.length - 1; index >= 0; index -= 1) {
        const item = compacted[index];
        if (item.type === 'saveEvent' && (item.client_id || item.event?.id) === id) {
          compacted.splice(index, 1);
        }
      }
      if (!isLocalEventId(id)) compacted.push(mutation);
    }
  });

  return compacted;
}

export function replaceQueuedEventId(queue, fromId, toId) {
  return compactQueuedMutations(
    (queue || []).map((mutation) => {
      if (mutation.type === 'saveEvent' && (mutation.client_id === fromId || mutation.event?.id === fromId)) {
        return {
          ...mutation,
          client_id: toId,
          event: { ...mutation.event, id: toId },
        };
      }
      if (mutation.type === 'deleteEvent' && mutation.event_id === fromId) {
        return { ...mutation, event_id: toId };
      }
      return mutation;
    }),
  );
}

export function isLocalEventId(id) {
  return /^tmp-|^offline-/.test(String(id || ''));
}

function normalizeWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object') return null;
  return {
    version: workspace.version || 1,
    cached_at: workspace.cached_at || null,
    profile: workspace.profile || null,
    calendars: Array.isArray(workspace.calendars) ? workspace.calendars : [],
    tags: Array.isArray(workspace.tags) ? workspace.tags : [],
    quickAddTemplates: Array.isArray(workspace.quickAddTemplates)
      ? workspace.quickAddTemplates
      : [],
    events: sortEvents(Array.isArray(workspace.events) ? workspace.events : []),
    activeCalendarId: workspace.activeCalendarId || null,
  };
}

function sortEvents(events) {
  return [...events].sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0));
}

function workspaceKey(userId) {
  return `${WORKSPACE_KEY_PREFIX}${userId}`;
}

function queueKey(userId) {
  return `${QUEUE_KEY_PREFIX}${userId}`;
}

function readJson(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[offline] read failed', error);
    return null;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('[offline] write failed', error);
  }
}

function makeQueueId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
