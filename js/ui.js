import { FALLBACK_TAG_COLOR, FALLBACK_TAG_NAME } from './config.js';
import {
  addDays,
  dateKey,
  endOfDay,
  eventOccursOn,
  formatRangeTitle,
  fromLocalInputValue,
  minutesSinceStartOfDay,
  sameDay,
  startOfDay,
  startOfMonthGrid,
  startOfWeek,
  toLocalInputValue,
} from './dateUtils.js';
import { escapeHtml, safeColor } from './htmlSafe.js';
import {
  canEditCalendar,
  defaultTagFor,
  eventTag,
  findTag,
  isTaskEvent,
  state,
  tagsForCalendar,
  uniqueById,
  visibleEvents,
  visibleFocusArchiveEvents,
  visibleFocusEvents,
  visibleMonthEvents,
  visibleTags,
} from './store.js';

const els = {};
const FREE_TIME_PREF_KEY = 'kalender-free-time-settings-v1';
let freeTimePreferencesLoaded = false;

export function bindElements() {
  [
    'login-view',
    'calendar-view',
    'login-form',
    'login-error',
    'email',
    'password',
    'user-email',
    'account-email',
    'calendar-list',
    'archived-toggle',
    'tag-filter-panel',
    'tag-filter-count',
    'category-filters',
    'weekly-overview',
    'event-search',
    'free-time-form',
    'free-time-date',
    'free-time-end-date',
    'free-time-duration',
    'free-time-window-start',
    'free-time-window-end',
    'free-time-results',
    'theme-toggle',
    'logout-btn',
    'new-event-btn',
    'new-calendar-btn',
    'new-tag-btn',
    'tag-list',
    'prev-btn',
    'today-btn',
    'next-btn',
    'month-entry-scope-btn',
    'period-title',
    'calendar-grid',
    'event-modal',
    'event-form',
    'event-modal-title',
    'event-id',
    'event-calendar',
    'event-title',
    'event-description',
    'event-start',
    'event-end',
    'event-tag-id',
    'event-tag-options',
    'event-reminder',
    'event-error',
    'delete-event-btn',
    'calendar-modal',
    'calendar-form',
    'calendar-name',
    'calendar-color',
    'calendar-error',
    'tag-modal',
    'tag-form',
    'tag-modal-title',
    'tag-id',
    'tag-calendar',
    'tag-name',
    'tag-color',
    'tag-error',
    'delete-tag-btn',
    'tag-delete-modal',
    'tag-delete-form',
    'tag-delete-title',
    'tag-delete-id',
    'tag-delete-summary',
    'tag-delete-error',
    'tag-delete-confirm-btn',
    'share-modal',
    'share-form',
    'share-title',
    'share-calendar-id',
    'share-user-id',
    'share-role',
    'share-error',
    'type-picker-modal',
    'focus-overview-title',
    'quick-add-template-list',
    'new-quick-add-template-btn',
    'quick-add-template-modal',
    'quick-add-template-form',
    'quick-add-template-modal-title',
    'quick-add-template-id',
    'quick-add-template-shortcut',
    'quick-add-template-title',
    'quick-add-template-duration',
    'quick-add-template-start',
    'quick-add-template-tag',
    'quick-add-template-calendar',
    'quick-add-template-error',
    'delete-quick-add-template-btn',
    'toast',
  ].forEach((id) => {
    els[toCamel(id)] = document.getElementById(id);
  });
  els.viewTabs = [...document.querySelectorAll('.view-tab')];
  els.bottomTabs = [...document.querySelectorAll('.bottom-tab')];
  els.focusViewTabs = [...document.querySelectorAll('[data-focus-view]')];
  els.appPanels = [...document.querySelectorAll('.app-panel')];
  els.closeModalButtons = [...document.querySelectorAll('[data-close-modal]')];
  return els;
}

export function elements() {
  return els;
}

export function setAuthenticatedView(isAuthenticated) {
  els.loginView.classList.toggle('hidden', isAuthenticated);
  els.calendarView.classList.toggle('hidden', !isAuthenticated);
  document.body.classList.toggle('authenticated', isAuthenticated);
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

export function setActivePanel(panelName) {
  els.bottomTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === panelName);
  });
  els.appPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === panelName);
  });
}

export function renderUser() {
  const email = state.session?.user?.email || '';
  els.userEmail.textContent = email;
  if (els.accountEmail) els.accountEmail.textContent = email || 'Not signed in';
}

export function renderAll() {
  renderCalendars();
  renderTags();
  renderQuickAddTemplates();
  renderTagFilters();
  renderFreeTimeFinder();
  renderCalendar();
  renderWeeklyOverview();
  if (!els.eventModal.open) {
    renderEventCalendarOptions();
    renderEventTagOptions();
  }
}

export function renderCalendars() {
  els.calendarList.innerHTML = '';
  if (els.archivedToggle) els.archivedToggle.checked = state.showArchivedCalendars;

  const calendars = uniqueById(
    state.calendars.filter((calendar) => state.showArchivedCalendars || !calendar.archived_at),
  );

  if (!calendars.length) {
    els.calendarList.innerHTML = '<p class="empty-note">No calendars to show.</p>';
    return;
  }

  calendars.forEach((calendar) => {
    const isArchived = Boolean(calendar.archived_at);
    const item = document.createElement('div');
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.className = `calendar-list-item${
      calendar.id === state.activeCalendarId ? ' active' : ''
    }${isArchived ? ' archived' : ''}`;
    item.dataset.calendarId = calendar.id;
    item.innerHTML = `
      <span class="calendar-color" style="--calendar-color:${safeColor(calendar.color, '#92c5fc')}"></span>
      <span class="calendar-name">${escapeHtml(calendar.name)}</span>
      <span class="role-pill">${isArchived ? 'archived' : calendar.role}</span>
      ${
        calendar.role === 'owner'
          ? `<span class="calendar-actions">
              <button class="share-affordance" type="button" title="Share calendar">Share</button>
              <button class="calendar-archive" type="button" title="${isArchived ? 'Restore calendar' : 'Archive calendar'}">
                ${isArchived ? 'Restore' : 'Archive'}
              </button>
              <button class="calendar-delete" type="button" title="Delete calendar">Delete</button>
            </span>`
          : ''
      }
    `;
    els.calendarList.append(item);
  });
}

// Filter chips show one entry per tag visible in the current calendar
// scope. When state.activeCalendarId is set this is just that calendar's
// tags; otherwise the union across visible calendars.
export function renderTagFilters() {
  els.categoryFilters.innerHTML = '';
  const tags = visibleTags();
  if (els.tagFilterCount) {
    els.tagFilterCount.textContent = String(tags.length);
  }
  tags.forEach((tag) => {
    const label = document.createElement('label');
    label.className = 'category-chip';
    label.innerHTML = `
      <input type="checkbox" value="${tag.id}" ${
        state.selectedTagIds.has(tag.id) ? 'checked' : ''
      } />
      <span style="--category-color:${safeColor(tag.color)}"></span>
      ${escapeHtml(tag.name)}
    `;
    els.categoryFilters.append(label);
  });
}

// Settings → Tags. Grouped by calendar so the user can see at a glance which
// tags belong where. Only calendars where the user can edit get an "Add"
// affordance — viewers can read but not modify.
export function readFreeTimeForm() {
  ensureFreeTimeDefaults();
  const startDate = new Date(`${els.freeTimeDate.value}T00:00:00`);
  const endDate = new Date(`${els.freeTimeEndDate.value}T00:00:00`);
  const durationMinutes = Number(els.freeTimeDuration.value);
  const windowStartMinutes = parseTimeMinutes(els.freeTimeWindowStart.value);
  const windowEndMinutes = parseTimeMinutes(els.freeTimeWindowEnd.value);
  const days = daysInInclusiveRange(startDate, endDate);

  if (Number.isNaN(startDate.getTime())) throw new Error('Pick a start date.');
  if (Number.isNaN(endDate.getTime())) throw new Error('Pick an end date.');
  if (endDate < startDate) throw new Error('End date must be after start date.');
  if (!Number.isFinite(days) || days < 1 || days > 14) {
    throw new Error('Pick a date range between 1 and 14 days.');
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new Error('Pick a duration between 15 minutes and 8 hours.');
  }
  if (windowStartMinutes == null || windowEndMinutes == null) {
    throw new Error('Pick a valid time window.');
  }
  if (windowEndMinutes <= windowStartMinutes) {
    throw new Error('The end of the window must be after the start.');
  }
  if (windowEndMinutes - windowStartMinutes < durationMinutes) {
    throw new Error('The time window is shorter than the meeting duration.');
  }

  persistFreeTimePreferences();

  return {
    startDate,
    days,
    durationMinutes,
    windowStartMinutes,
    windowEndMinutes,
  };
}

export function persistFreeTimePreferences() {
  if (!els.freeTimeWindowStart || !els.freeTimeWindowEnd) return;
  try {
    localStorage.setItem(
      FREE_TIME_PREF_KEY,
      JSON.stringify({
        duration: els.freeTimeDuration?.value || '60',
        windowStart: els.freeTimeWindowStart.value || '09:00',
        windowEnd: els.freeTimeWindowEnd.value || '18:00',
      }),
    );
  } catch (error) {
    console.warn('[free-time] could not persist preferences', error);
  }
}

export function renderFreeTimeFinder() {
  if (!els.freeTimeResults) return;
  ensureFreeTimeDefaults();
  const slots = state.freeTimeSlots;
  const status = state.freeTimeStatus || 'Find open slots across your visible calendars.';

  if (!slots.length) {
    els.freeTimeResults.innerHTML = `<p class="empty-note">${escapeHtml(status)}</p>`;
    return;
  }

  els.freeTimeResults.innerHTML = `
    <details class="free-time-results-panel" ${state.freeTimeResultsOpen ? 'open' : ''}>
      <summary data-free-time-results-summary>
        <span>Results</span>
        <strong>${slots.length}</strong>
      </summary>
      <div class="free-time-results-panel-body">
        <div class="free-time-result-head">
          <span>${escapeHtml(status)}</span>
          <button class="ghost-action free-time-share-all" type="button" data-share-free-time="all">
            Share all
          </button>
        </div>
        ${slots
          .map(
            (slot) => `
              <article class="free-time-slot">
                <div>
                  <strong>${escapeHtml(formatSlotDate(slot))}</strong>
                  <span>${escapeHtml(formatSlotTime(slot))}</span>
                </div>
                <button class="free-time-share" type="button" data-share-free-time="${slot.id}">
                  Share
                </button>
              </article>
            `,
          )
          .join('')}
      </div>
    </details>
  `;
}

function ensureFreeTimeDefaults() {
  if (!els.freeTimeDate) return;
  if (!freeTimePreferencesLoaded) {
    try {
      const prefs = JSON.parse(localStorage.getItem(FREE_TIME_PREF_KEY) || '{}');
      if (prefs.duration && els.freeTimeDuration) els.freeTimeDuration.value = prefs.duration;
      if (prefs.windowStart && els.freeTimeWindowStart) {
        els.freeTimeWindowStart.value = prefs.windowStart;
      }
      if (prefs.windowEnd && els.freeTimeWindowEnd) {
        els.freeTimeWindowEnd.value = prefs.windowEnd;
      }
    } catch (error) {
      console.warn('[free-time] could not load preferences', error);
    }
    freeTimePreferencesLoaded = true;
  }
  if (!els.freeTimeDate.value) {
    els.freeTimeDate.value = dateKey(new Date());
  }
  if (!els.freeTimeEndDate.value) {
    els.freeTimeEndDate.value = dateKey(addDays(new Date(), 7));
  }
  if (!els.freeTimeWindowStart.value) els.freeTimeWindowStart.value = '09:00';
  if (!els.freeTimeWindowEnd.value) els.freeTimeWindowEnd.value = '18:00';
}

function daysInInclusiveRange(startDate, endDate) {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return NaN;
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - start) / 86400000) + 1;
}

function parseTimeMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatSlotDate(slot) {
  return new Date(slot.starts_at).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatSlotTime(slot) {
  return `${formatClock(new Date(slot.starts_at))} - ${formatClock(new Date(slot.ends_at))}`;
}

function formatClock(date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function renderTags() {
  els.tagList.innerHTML = '';
  const editableCalendars = state.calendars.filter(
    (calendar) => !calendar.archived_at && canEditCalendar(calendar.id),
  );

  if (!editableCalendars.length) {
    els.tagList.innerHTML =
      '<p class="empty-note">You need an editable calendar to manage tags.</p>';
    return;
  }

  uniqueById(state.calendars)
    .filter((calendar) => !calendar.archived_at)
    .forEach((calendar) => {
      const calendarTags = tagsForCalendar(calendar.id);
      const editable = canEditCalendar(calendar.id);

      const group = document.createElement('section');
      group.className = 'tag-group';
      const previewTags = calendarTags.slice(0, 5);
      group.innerHTML = `
        <details class="tag-group-details">
          <summary class="tag-group-summary">
            <span class="tag-group-title">
              <strong>${escapeHtml(calendar.name)}</strong>
              <small>${calendarTags.length} tag${calendarTags.length === 1 ? '' : 's'}</small>
            </span>
            <span class="tag-preview" aria-hidden="true">
              ${previewTags
                .map(
                  (tag) =>
                    `<span class="tag-preview-dot" style="--tag-color:${safeColor(tag.color)}"></span>`,
                )
                .join('')}
            </span>
          </summary>
          <div class="tag-group-menu">
            <div class="tag-group-actions">
              ${
                editable
                  ? `<button class="ghost-action tag-group-add" type="button" data-tag-add-calendar-id="${calendar.id}">+ Add tag</button>`
                  : '<span class="role-pill">view only</span>'
              }
            </div>
            ${
              calendarTags.length
                ? calendarTags
                    .map(
                      (tag) => `
                        <div class="tag-list-item" data-tag-id="${tag.id}">
                          <span class="tag-dot" style="--tag-color:${safeColor(tag.color)}"></span>
                          <strong>${escapeHtml(tag.name)}</strong>
                          ${editable ? `
                            <button class="tag-edit" type="button">Edit</button>
                            <button class="tag-delete" type="button">Delete</button>
                          ` : ''}
                        </div>
                      `,
                    )
                    .join('')
                : '<p class="empty-note">No tags yet.</p>'
            }
          </div>
        </details>
      `;
      els.tagList.append(group);
    });
}

export function renderQuickAddTemplates() {
  if (!els.quickAddTemplateList) return;
  els.quickAddTemplateList.innerHTML = '';

  if (!state.quickAddTemplates.length) {
    els.quickAddTemplateList.innerHTML =
      '<p class="empty-note">No quick-add shortcuts yet.</p>';
    return;
  }

  state.quickAddTemplates.forEach((template) => {
    const tag = template.default_tag ? findTag(template.default_tag) : null;
    const calendar = template.default_calendar_id
      ? state.calendars.find((c) => c.id === template.default_calendar_id)
      : null;
    const meta = [
      template.default_start_time ? template.default_start_time.slice(0, 5) : null,
      `${template.default_duration_minutes}m`,
      tag ? tag.name : null,
      calendar ? calendar.name : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const row = document.createElement('div');
    row.className = 'quick-add-template-item';
    row.dataset.quickAddTemplateId = template.id;
    row.innerHTML = `
      <div class="quick-add-template-main">
        <strong>${escapeHtml(template.shortcut)}</strong>
        <span class="quick-add-template-title">
          ${escapeHtml(template.default_title || '(no default title)')}
        </span>
        <small>${escapeHtml(meta)}</small>
      </div>
      <div class="quick-add-template-actions">
        <button class="quick-add-template-edit" type="button">Edit</button>
        <button class="quick-add-template-delete" type="button">Delete</button>
      </div>
    `;
    els.quickAddTemplateList.append(row);
  });
}

export function openQuickAddTemplateModal(template = null) {
  if (!els.quickAddTemplateModal) return;
  els.quickAddTemplateModalTitle.textContent = template ? 'Edit quick-add' : 'New quick-add';
  els.quickAddTemplateId.value = template?.id || '';
  els.quickAddTemplateShortcut.value = template?.shortcut || '';
  els.quickAddTemplateTitle.value = template?.default_title || '';
  els.quickAddTemplateDuration.value = template?.default_duration_minutes ?? 60;
  if (els.quickAddTemplateStart) {
    els.quickAddTemplateStart.value = template?.default_start_time?.slice(0, 5) || '';
  }

  // Tag picker shows tags from the template's default_calendar_id, or every
  // visible tag if no calendar is chosen. Re-runs when default_calendar_id
  // changes (listener wired in app.js).
  populateQuickAddTemplateTagOptions(
    template?.default_calendar_id || '',
    template?.default_tag || '',
  );

  els.quickAddTemplateCalendar.innerHTML =
    '<option value="">No default calendar</option>' +
    uniqueById(state.calendars)
      .filter((c) => !c.archived_at)
      .map(
        (calendar) =>
          `<option value="${calendar.id}" ${
            calendar.id === template?.default_calendar_id ? 'selected' : ''
          }>${escapeHtml(calendar.name)}</option>`,
      )
      .join('');

  els.deleteQuickAddTemplateBtn.hidden = !template;
  els.quickAddTemplateError.textContent = '';
  els.quickAddTemplateModal.showModal();
}

export function populateQuickAddTemplateTagOptions(calendarId, selectedTagId = '') {
  const tags = calendarId ? tagsForCalendar(calendarId) : uniqueById(state.tags);
  els.quickAddTemplateTag.innerHTML =
    '<option value="">No default tag</option>' +
    tags
      .map(
        (tag) =>
          `<option value="${escapeHtml(tag.id)}" ${
            tag.id === selectedTagId ? 'selected' : ''
          }>${escapeHtml(tag.name)}${calendarId ? '' : ` (${escapeHtml(calendarFor(tag)?.name || '?')})`}</option>`,
      )
      .join('');
}

function calendarFor(tag) {
  return state.calendars.find((c) => c.id === tag.calendar_id) || null;
}

export function readQuickAddTemplateForm() {
  const shortcut = els.quickAddTemplateShortcut.value.trim();
  if (!shortcut) throw new Error('Shortcut keyword is required.');
  if (/\s/.test(shortcut)) {
    throw new Error('Shortcut keyword cannot contain spaces.');
  }
  const duration = Number(els.quickAddTemplateDuration.value);
  if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
    throw new Error('Duration must be between 1 and 1440 minutes.');
  }
  return {
    id: els.quickAddTemplateId.value || null,
    shortcut,
    default_title: els.quickAddTemplateTitle.value.trim(),
    default_duration_minutes: Math.round(duration),
    default_start_time: normalizeTimeValue(els.quickAddTemplateStart?.value),
    default_tag: els.quickAddTemplateTag.value || null,
    default_calendar_id: els.quickAddTemplateCalendar.value || null,
  };
}

function normalizeTimeValue(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  return `${match[1]}:${match[2]}:00`;
}

export function renderCalendar() {
  els.viewTabs.forEach((tab) =>
    tab.classList.toggle('active', tab.dataset.view === state.view),
  );
  renderMonthEntryScopeToggle();
  els.calendarView.classList.toggle('day-detail-mode', Boolean(state.dayDetailDate));

  if (state.dayDetailDate) {
    renderDayDetail(state.dayDetailDate);
    return;
  }

  els.periodTitle.textContent = formatRangeTitle(state.selectedDate, state.view);
  if (state.view === 'month') renderMonth();
  if (state.view === 'week') renderWeek();
  if (state.view === 'day') renderDay();
}

export function renderMonthEntryScopeToggle() {
  if (!els.monthEntryScopeBtn) return;
  const meta = monthEntryScopeMeta(state.monthEntryScope);
  els.monthEntryScopeBtn.textContent = meta.label;
  els.monthEntryScopeBtn.setAttribute('aria-label', meta.ariaLabel);
  els.monthEntryScopeBtn.dataset.scope = state.monthEntryScope;
}

export function renderWeeklyOverview() {
  const isArchive = state.focusView === 'archive';
  const events = (isArchive ? visibleFocusArchiveEvents() : visibleFocusEvents()).slice(0, 12);

  if (els.focusOverviewTitle) {
    els.focusOverviewTitle.textContent = isArchive ? 'Archive' : 'This week';
  }
  els.focusViewTabs.forEach((tab) => {
    const active = tab.dataset.focusView === state.focusView;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  els.weeklyOverview.innerHTML =
    events.length === 0
      ? `<p class="empty-note">${isArchive ? 'No archived focus items.' : 'No active focus items this week.'}</p>`
      : events
          .map(
            (event) => `
              <div class="overview-event ${event.completed ? 'completed' : ''}${isArchive ? ' archived' : ''}">
        <span style="--event-color:${safeColor(eventColor(event))}"></span>
        ${
          isArchive
            ? `<button
                class="overview-restore"
                type="button"
                data-restore-event-id="${event.id}"
                aria-label="${isTaskEvent(event) ? 'Restore task' : 'Move event to today'}"
              >Restore</button>`
            : isTaskEvent(event)
            ? `<button
                class="task-check"
                type="button"
                data-complete-event-id="${event.id}"
                aria-label="${event.completed ? 'Mark incomplete' : 'Mark complete'}"
                aria-pressed="${event.completed ? 'true' : 'false'}"
              ></button>`
            : '<span class="task-check-placeholder" aria-hidden="true"></span>'
        }
                <button class="overview-main" type="button" data-event-id="${event.id}">
                  <strong>${escapeHtml(event.title)}</strong>
                  <small>${formatEventTime(event)}</small>
                </button>
              </div>
            `,
          )
          .join('');

}

export function renderEventCalendarOptions(selectedCalendarId = state.activeCalendarId) {
  els.eventCalendar.innerHTML = state.calendars
    .map(
      (calendar) =>
        `<option value="${calendar.id}" ${
          calendar.id === selectedCalendarId ? 'selected' : ''
        } ${canEditCalendar(calendar.id) && !calendar.archived_at ? '' : 'disabled'}>${escapeHtml(
          calendar.name,
        )}</option>`,
    )
    .join('');
}

// Render the chips for the event modal's tag picker. Shows tags from the
// currently-selected calendar (event-calendar select). Defaults to the
// event's own tag, otherwise the calendar's "Untagged".
export function renderEventTagOptions(selectedTagId = null) {
  const calendarId = els.eventCalendar.value || state.activeCalendarId;
  const tags = tagsForCalendar(calendarId);
  let selected = selectedTagId || els.eventTagId.value || '';
  // If the previously-selected tag is from another calendar, fall back to
  // the calendar's default. This keeps the picker honest when the user
  // changes the event's calendar mid-edit.
  if (!selected || !tags.some((tag) => tag.id === selected)) {
    selected = defaultTagFor(calendarId)?.id || '';
    els.eventTagId.value = selected;
  }

  if (!tags.length) {
    els.eventTagOptions.innerHTML =
      '<p class="empty-note">No tags for this calendar yet. Create one in Settings.</p>';
    return;
  }
  els.eventTagOptions.innerHTML = tags
    .map(
      (tag) => `
        <button
          class="tag-picker-chip ${tag.id === selected ? 'active' : ''}"
          type="button"
          data-tag-id="${tag.id}"
          aria-pressed="${tag.id === selected ? 'true' : 'false'}"
          style="--tag-color:${safeColor(tag.color)}"
        >
          <span></span>
          ${escapeHtml(tag.name)}
        </button>
      `,
    )
    .join('');
}

export function openEventModal(event = null, date = null, draft = {}) {
  const writableCalendar =
    state.calendars.find(
      (calendar) => calendar.id === state.activeCalendarId && canEditCalendar(calendar.id),
    ) || state.calendars.find((calendar) => canEditCalendar(calendar.id));

  if (!event && !writableCalendar) {
    showToast('You only have viewer access to the selected calendars.');
    return;
  }

  const start = event
    ? new Date(event.starts_at)
    : draft.starts_at
      ? new Date(draft.starts_at)
      : defaultStart(date || state.dayDetailDate || state.selectedDate);
  const end = event
    ? new Date(event.ends_at)
    : draft.ends_at
      ? new Date(draft.ends_at)
      : new Date(start.getTime() + 60 * 60 * 1000);

  els.eventModalTitle.textContent = event ? 'Edit event' : 'New event';
  const calendarId = event?.calendar_id || draft.calendar_id || writableCalendar.id;
  renderEventCalendarOptions(calendarId);
  els.eventId.value = event?.id || '';
  els.eventCalendar.value = calendarId;
  els.eventTitle.value = event?.title || draft.title || '';
  els.eventDescription.value = event?.description || draft.description || '';
  els.eventStart.value = toLocalInputValue(start);
  els.eventEnd.value = toLocalInputValue(end);
  els.eventForm.dataset.durationMinutes = String(Math.max(1, Math.round((end - start) / 60000)));

  // Pick the right tag id: the event's actual tag, the draft's tag (only if
  // it's valid for the event's calendar), or the calendar's default Untagged.
  const tagsHere = tagsForCalendar(calendarId);
  let initialTagId = event?.tag_id || draft.tag_id || '';
  if (!tagsHere.some((tag) => tag.id === initialTagId)) {
    initialTagId = defaultTagFor(calendarId)?.id || '';
  }
  selectEventTag(initialTagId);

  els.eventReminder.checked = Boolean(event?.reminder_minutes || draft.reminder_minutes);
  const options = els.eventModal.querySelector('.event-options');
  if (options) {
    options.open = Boolean(event && (event.description || event.reminder_minutes));
  }
  els.deleteEventBtn.hidden = !event;
  els.eventError.textContent = '';
  els.eventModal.showModal();
}

export function readEventForm() {
  const id = els.eventId.value || null;
  const existingEvent = id ? state.events.find((event) => event.id === id) : null;
  const startsAt = fromLocalInputValue(els.eventStart.value);
  const endsAt = fromLocalInputValue(els.eventEnd.value);
  const calendarId = els.eventCalendar.value;
  const tagId = els.eventTagId.value;

  if (endsAt <= startsAt) throw new Error('End time must be after start time.');
  if (!calendarId) throw new Error('Pick a calendar for this event.');
  const tag = findTag(tagId);
  if (!tag || tag.calendar_id !== calendarId) {
    throw new Error('Pick a tag from the selected calendar.');
  }

  return {
    id,
    calendar_id: calendarId,
    title: els.eventTitle.value.trim(),
    description: els.eventDescription.value.trim(),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    tag_id: tagId,
    reminder_minutes: els.eventReminder.checked ? 15 : null,
    completed: Boolean(existingEvent?.completed),
  };
}

export function selectEventTag(tagId) {
  const calendarId = els.eventCalendar.value || state.activeCalendarId;
  const tag = findTag(tagId) || defaultTagFor(calendarId);
  els.eventTagId.value = tag?.id || '';
  renderEventTagOptions(tag?.id || null);
}

export function openDayDetail(date) {
  state.dayDetailDate = startOfDay(date);
  state.selectedDate = startOfDay(date);
  renderCalendar();
}

export function closeDayDetail() {
  state.dayDetailDate = null;
  renderCalendar();
}

let pendingTypePickerDate = null;

export function openTypePicker(date = null) {
  pendingTypePickerDate = date ? new Date(date) : null;
  if (!els.typePickerModal) {
    console.warn('[type-picker] modal element missing - falling back to event modal');
    openEventModal(null, pendingTypePickerDate);
    return;
  }
  els.typePickerModal.showModal();
}

export function closeTypePicker() {
  if (els.typePickerModal?.open) els.typePickerModal.close();
}

export function consumePendingTypePickerDate() {
  const date = pendingTypePickerDate;
  pendingTypePickerDate = null;
  return date;
}

export function openCalendarModal() {
  els.calendarName.value = '';
  els.calendarColor.value = '#92c5fc';
  els.calendarError.textContent = '';
  els.calendarModal.showModal();
}

// New tag → calendar dropdown listed only with calendars the user can edit.
// Existing tag → dropdown disabled (calendar is immutable; rename or delete
// instead).
export function openTagModal(tag = null, presetCalendarId = null) {
  els.tagModalTitle.textContent = tag ? 'Edit tag' : 'New tag';
  els.tagId.value = tag?.id || '';

  const editableCalendars = state.calendars.filter(
    (calendar) => !calendar.archived_at && canEditCalendar(calendar.id),
  );

  els.tagCalendar.innerHTML = editableCalendars
    .map(
      (calendar) =>
        `<option value="${calendar.id}" ${
          calendar.id === (tag?.calendar_id || presetCalendarId || state.activeCalendarId) ? 'selected' : ''
        }>${escapeHtml(calendar.name)}</option>`,
    )
    .join('');

  // Editing an existing tag: lock the calendar field so the user doesn't
  // accidentally re-home a tag (which would also need to remap events).
  els.tagCalendar.disabled = Boolean(tag);

  els.tagName.value = tag?.name || '';
  els.tagColor.value = tag?.color || '#92c5fc';
  els.deleteTagBtn.hidden = !tag;
  els.tagError.textContent = '';
  els.tagModal.showModal();
}

export function readTagForm() {
  const name = els.tagName.value.trim();
  if (!name) throw new Error('Tag name is required.');
  const calendarId = els.tagCalendar.value;
  if (!calendarId) throw new Error('Pick a calendar for this tag.');
  return {
    id: els.tagId.value || null,
    calendar_id: calendarId,
    name,
    color: els.tagColor.value,
  };
}

// Tag delete confirmation. Caller resolves the affected count and the
// reassignment target ("Untagged" of this calendar) before showing.
export function openTagDeleteModal({ tag, affectedCount, targetTagName }) {
  els.tagDeleteId.value = tag.id;
  els.tagDeleteTitle.textContent = `Delete "${tag.name}"?`;
  if (affectedCount > 0) {
    els.tagDeleteSummary.textContent =
      `This will reassign ${affectedCount} event${affectedCount === 1 ? '' : 's'} to "${targetTagName}".`;
  } else {
    els.tagDeleteSummary.textContent = 'This tag is not in use.';
  }
  els.tagDeleteError.textContent = '';
  els.tagDeleteModal.showModal();
}

export function closeTagDeleteModal() {
  if (els.tagDeleteModal.open) els.tagDeleteModal.close();
}

export function setTagDeleteError(message) {
  els.tagDeleteError.textContent = message || '';
}

export function openShareModal(calendarId) {
  const calendar = state.calendars.find((item) => item.id === calendarId);
  if (!calendar || calendar.role !== 'owner') return;
  els.shareTitle.textContent = `Share ${calendar.name}`;
  els.shareCalendarId.value = calendarId;
  els.shareUserId.value = '';
  els.shareUserId.type = 'email';
  els.shareUserId.placeholder = 'person@example.com';
  els.shareRole.value = 'collaborator';
  els.shareError.textContent = '';
  els.shareModal.showModal();
}

export function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.classList.remove('visible');
  }, 3200);
}

function renderMonth() {
  const today = new Date();
  const gridStart = startOfMonthGrid(state.selectedDate);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const monthLayout = buildMonthEventLayout(days);

  els.calendarGrid.className = 'calendar-grid month-grid';
  els.calendarGrid.innerHTML = weekHeaderHtml();
  days.forEach((day) => {
    const dayEvents = visibleMonthEvents()
      .filter((event) => eventOccursOn(event, day))
      .map((event) => ({ event, lane: monthLayout.laneByEventId.get(event.id) ?? 99 }))
      .sort((a, b) => a.lane - b.lane || new Date(a.event.starts_at) - new Date(b.event.starts_at));
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `month-cell${sameDay(day, today) ? ' today' : ''}${
      day.getMonth() !== state.selectedDate.getMonth() ? ' muted' : ''
    }`;
    cell.dataset.date = dateKey(day);
    cell.innerHTML = `
      <span class="day-number">${day.getDate()}</span>
      <span class="event-stack">
        ${Array.from({ length: 3 }, (_, lane) => {
          const entry = dayEvents.find((item) => item.lane === lane);
          if (!entry) return '<span class="event-lane-spacer" aria-hidden="true"></span>';
          const event = entry.event;
          return `
            <span class="event-pill ${eventPillClass(event, day)}" draggable="true" data-event-id="${event.id}" style="--event-color:${safeColor(eventColor(event))}">
              ${escapeHtml(event.title)}
            </span>
          `;
        }).join('')}
        ${dayEvents.filter((item) => item.lane >= 3).length ? `<span class="more-pill">+${dayEvents.filter((item) => item.lane >= 3).length}</span>` : ''}
      </span>
    `;
    els.calendarGrid.append(cell);
  });
}

function buildMonthEventLayout(days) {
  const visible = visibleMonthEvents()
    .map((event) => {
      const indexes = days
        .map((day, index) => (eventOccursOn(event, day) ? index : -1))
        .filter((index) => index !== -1);
      return {
        event,
        startIndex: indexes[0],
        endIndex: indexes[indexes.length - 1],
      };
    })
    .filter((item) => item.startIndex != null)
    .sort(
      (a, b) =>
        a.startIndex - b.startIndex ||
        new Date(a.event.starts_at) - new Date(b.event.starts_at) ||
        b.endIndex - b.startIndex - (a.endIndex - a.startIndex) ||
        a.event.title.localeCompare(b.event.title),
    );

  const laneEnds = [];
  const laneByEventId = new Map();
  visible.forEach(({ event, startIndex, endIndex }) => {
    let lane = laneEnds.findIndex((lastEnd) => lastEnd < startIndex);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endIndex;
    laneByEventId.set(event.id, lane);
  });

  return { laneByEventId };
}

function monthEntryScopeMeta(scope) {
  if (scope === 'mine') {
    return { label: 'Mine', ariaLabel: 'Show my entries in month view' };
  }
  if (scope === 'others') {
    return { label: 'Others', ariaLabel: 'Show collaborator entries in month view' };
  }
  return { label: 'All', ariaLabel: 'Show all entries in month view' };
}

function renderDayDetail(date) {
  const selected = startOfDay(date);
  const dayEvents = visibleEvents().filter((event) => eventOccursOn(event, selected));
  const activeEvents = dayEvents.filter((event) => !event.completed);
  const tasks = dayEvents.filter(isTaskEvent);
  const otherEvents = activeEvents.filter((event) => !isTaskEvent(event));
  const upcoming = visibleEvents()
    .filter((event) => new Date(event.starts_at) > endOfDay(selected))
    .slice(0, 3);
  const dayLabel = selected.toLocaleDateString(undefined, { weekday: 'long' });
  const dateLabel = selected.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });

  els.calendarGrid.className = 'calendar-grid day-detail';
  els.calendarGrid.innerHTML = `
    <section class="day-detail-shell" data-date="${dateKey(selected)}">
      <section class="day-detail-card">
        <header class="day-detail-header">
          <button class="day-detail-back" type="button" data-day-detail-back aria-label="Back to calendar">
            <span aria-hidden="true">&lt;</span>
          </button>
          <div class="day-detail-title">
            <span>${dayLabel}</span>
            <h2>${dateLabel}</h2>
          </div>
          <details class="day-detail-create">
            <summary aria-label="Add to this day">
              <span aria-hidden="true">+</span>
            </summary>
            <button
              class="day-detail-create-backdrop"
              type="button"
              data-day-add-cancel
              aria-label="Cancel add"
            ></button>
            <div class="day-detail-actions">
              <label class="quick-add">
                <span>Custom Quick Add</span>
                <select data-day-quick-add-template>
                  <option value="">No custom quick add</option>
                  ${state.quickAddTemplates
                    .map(
                      (template) =>
                        `<option value="${escapeHtml(template.id)}">${escapeHtml(template.shortcut)}</option>`,
                    )
                    .join('')}
                </select>
              </label>
              <button class="primary-action day-detail-add" type="button" data-day-add aria-label="Add">
                +
              </button>
            </div>
          </details>
        </header>

        <section class="today-dashboard" aria-label="Day summary">
          <div>
            <strong>${otherEvents.length}</strong>
            <span>events</span>
          </div>
          <div>
            <strong>${tasks.length}</strong>
            <span>tasks</span>
          </div>
          <div>
            <strong>${upcoming.length}</strong>
            <span>next</span>
          </div>
        </section>

      </section>

      ${renderDayDetailSection({
        title: 'Events',
        count: otherEvents.length,
        events: otherEvents,
        emptyText: 'No events for this day.',
        defaultOpen: true,
      })}
      ${renderDayDetailSection({
        title: 'Tasks',
        count: tasks.length,
        events: tasks,
        emptyText: 'No tasks for this day.',
        defaultOpen: true,
      })}
      ${renderDayDetailSection({
        title: 'Upcoming',
        count: upcoming.length,
        events: upcoming,
        emptyText: 'Nothing else coming up.',
        defaultOpen: false,
      })}
    </section>
  `;
}

function renderDayDetailSection({ title, count, events, emptyText, defaultOpen = false }) {
  const isOpen = defaultOpen && events.length > 0;
  return `
    <details class="day-detail-section" ${isOpen ? 'open' : ''}>
      <summary>
        <span>${title}</span>
        <strong>${count}</strong>
      </summary>
      ${renderDayDetailList(events, emptyText)}
    </details>
  `;
}

function renderDayDetailList(events, emptyText) {
  if (!events.length) return `<p class="empty-note">${emptyText}</p>`;
  return `
    <div class="day-detail-list">
      ${events
        .map(
          (event) => `
            <button class="day-detail-item ${event.completed ? 'completed' : ''}" type="button" data-event-id="${event.id}">
              <span style="--event-color:${safeColor(eventColor(event))}"></span>
              <strong>${escapeHtml(event.title)}</strong>
              <small>${formatEventTime(event)} - ${escapeHtml(eventTagLabel(event))}${eventCreatorLabel(event)}</small>
            </button>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderWeek() {
  const start = startOfWeek(state.selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  if (window.matchMedia('(max-width: 719px)').matches) {
    els.calendarGrid.className = 'calendar-grid week-list';
    els.calendarGrid.innerHTML = days.map(renderWeekListDay).join('');
    return;
  }

  els.calendarGrid.className = 'calendar-grid time-grid';
  els.calendarGrid.innerHTML = days
    .map((day) => renderTimeColumn(day, day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })))
    .join('');
}

function renderWeekListDay(day) {
  const dayEvents = visibleEvents().filter((event) => eventOccursOn(event, day));
  const label = day.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return `
    <section class="week-list-day" data-date="${dateKey(day)}">
      <header>
        <strong>${label}</strong>
        <span>${dayEvents.length || 'No'} event${dayEvents.length === 1 ? '' : 's'}</span>
      </header>
      <div class="week-list-events">
        ${
          dayEvents.length
            ? dayEvents
                .map(
                  (event) => `
                    <button
                      class="week-list-event ${event.completed ? 'completed' : ''}"
                      type="button"
                      data-event-id="${event.id}"
                    >
                      <span style="--event-color:${safeColor(eventColor(event))}"></span>
                      <strong>${escapeHtml(event.title)}</strong>
                      <small>${formatEventTime(event)}</small>
                    </button>
                  `,
                )
                .join('')
            : '<p class="empty-note">Tap to add an event.</p>'
        }
      </div>
    </section>
  `;
}

function renderDay() {
  els.calendarGrid.className = 'calendar-grid time-grid day-grid';
  els.calendarGrid.innerHTML = renderTimeColumn(
    state.selectedDate,
    state.selectedDate.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }),
  );
}

function renderTimeColumn(day, label) {
  const dayEvents = visibleEvents().filter((event) => eventOccursOn(event, day));
  return `
    <section class="time-column" data-date="${dateKey(day)}">
      <header>${label}</header>
      <div class="time-lane">
        ${Array.from({ length: 24 }, (_, hour) => `<span>${String(hour).padStart(2, '0')}:00</span>`).join('')}
        ${dayEvents.map(renderPositionedEvent).join('')}
      </div>
    </section>
  `;
}

function renderPositionedEvent(event) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const top = (minutesSinceStartOfDay(start) / 1440) * 100;
  const height = Math.max(((end - start) / 60000 / 1440) * 100, 4);
  return `
    <button
      class="time-event"
      draggable="true"
      data-event-id="${event.id}"
      style="--event-color:${safeColor(eventColor(event))}; --top:${top}%; --height:${height}%"
      type="button"
    >
      <strong>${escapeHtml(event.title)}</strong>
      <span>${formatEventTime(event)}</span>
    </button>
  `;
}

function weekHeaderHtml() {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    .map((day) => `<div class="week-label">${day}</div>`)
    .join('');
}

function defaultStart(date) {
  const start = startOfDay(date);
  const now = new Date();
  if (sameDay(start, now) && now.getHours() < 22) {
    // "+1 hour" defaults that would cross midnight silently roll into the next
    // day's 00:00, which is never what the user means. Late in the evening,
    // skip the snap-to-next-hour and use 09:00 of the same day.
    start.setHours(now.getHours() + 1, 0, 0, 0);
  } else {
    start.setHours(9, 0, 0, 0);
  }
  return start;
}

function formatEventTime(event) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return formatter.format(new Date(event.starts_at));
}

function eventColor(event) {
  return eventTag(event).color || FALLBACK_TAG_COLOR;
}

function eventTagLabel(event) {
  return eventTag(event).name || FALLBACK_TAG_NAME;
}

function eventCreatorLabel(event) {
  if (!event.created_by) return '';
  if (event.created_by === state.session?.user?.id) return ' - by you';
  if (event.creator_email) return ` - by ${escapeHtml(event.creator_email.split('@')[0])}`;
  return ' - by collaborator';
}

function eventPillClass(event, day) {
  const classes = [];
  if (new Date(event.starts_at) < startOfDay(day)) classes.push('continues-left');
  if (new Date(event.ends_at) > endOfDay(day)) classes.push('continues-right');
  if (event.completed) classes.push('completed');
  return classes.join(' ');
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}
