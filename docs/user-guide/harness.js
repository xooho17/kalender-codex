import { addDays, startOfDay } from '../../js/dateUtils.js';
import { state, syncSelectedTags } from '../../js/store.js';
import {
  bindElements,
  elements,
  openDayDetail,
  openEventModal,
  openQuickAddTemplateModal,
  openShareModal,
  renderAll,
  renderUser,
  setActivePanel,
  setAuthenticatedView,
} from '../../js/ui.js';

const today = startOfDay(new Date());
const isoAt = (offset, hour, minute = 0) => {
  const next = addDays(today, offset);
  next.setHours(hour, minute, 0, 0);
  return next.toISOString();
};

const calendars = [
  { id: 'family', name: 'Familie', color: '#92c5fc', role: 'owner', owner_id: 'demo-user' },
  { id: 'work', name: 'Arbeit', color: '#f8c987', role: 'collaborator', owner_id: 'colleague' },
  {
    id: 'travel',
    name: 'Reisen',
    color: '#b8e0c2',
    role: 'owner',
    owner_id: 'demo-user',
    archived_at: isoAt(-20, 8),
  },
];

const tags = [
  { id: 'family-untagged', calendar_id: 'family', name: 'Untagged', color: '#94a3b8' },
  { id: 'family-personal', calendar_id: 'family', name: 'Personal', color: '#92c5fc' },
  { id: 'family-urgent', calendar_id: 'family', name: 'Urgent', color: '#f28b82' },
  { id: 'family-focus', calendar_id: 'family', name: 'Focus', color: '#c4b5fd' },
  { id: 'work-untagged', calendar_id: 'work', name: 'Untagged', color: '#94a3b8' },
  { id: 'work-work', calendar_id: 'work', name: 'Work', color: '#f8c987' },
  { id: 'work-focus', calendar_id: 'work', name: 'Focus', color: '#7dd3fc' },
];

const events = [
  {
    id: 'e1',
    calendar_id: 'family',
    title: 'Breakfast planning',
    description: 'Short check-in for the week.',
    starts_at: isoAt(0, 8, 30),
    ends_at: isoAt(0, 9, 0),
    tag_id: 'family-personal',
    created_by: 'demo-user',
    creator_email: 'demo@example.com',
    completed: false,
  },
  {
    id: 'e2',
    calendar_id: 'family',
    title: 'Task: Buy groceries',
    description: '',
    starts_at: isoAt(0, 12, 0),
    ends_at: isoAt(0, 12, 30),
    tag_id: 'family-urgent',
    created_by: 'demo-user',
    creator_email: 'demo@example.com',
    completed: false,
  },
  {
    id: 'e3',
    calendar_id: 'family',
    title: 'Piano lesson',
    description: '',
    starts_at: isoAt(1, 16, 30),
    ends_at: isoAt(1, 17, 30),
    tag_id: 'family-focus',
    created_by: 'demo-user',
    creator_email: 'demo@example.com',
    completed: false,
  },
  {
    id: 'e4',
    calendar_id: 'work',
    title: 'Sprint planning',
    description: '',
    starts_at: isoAt(2, 10, 0),
    ends_at: isoAt(2, 11, 0),
    tag_id: 'work-work',
    created_by: 'colleague',
    creator_email: 'nina@example.com',
    completed: false,
  },
  {
    id: 'e5',
    calendar_id: 'work',
    title: 'Deep work',
    description: '',
    starts_at: isoAt(3, 13, 0),
    ends_at: isoAt(3, 15, 0),
    tag_id: 'work-focus',
    created_by: 'demo-user',
    creator_email: 'demo@example.com',
    completed: false,
  },
  {
    id: 'e6',
    calendar_id: 'family',
    title: 'Task: Send birthday card',
    description: '',
    starts_at: isoAt(-10, 9, 0),
    ends_at: isoAt(-10, 9, 30),
    tag_id: 'family-personal',
    created_by: 'demo-user',
    creator_email: 'demo@example.com',
    completed: true,
  },
];

state.session = { user: { id: 'demo-user', email: 'demo@example.com' } };
state.calendars = calendars;
state.tags = tags;
state.events = events;
state.quickAddTemplates = [
  {
    id: 'qa-work',
    shortcut: 'work',
    default_title: 'Work block',
    default_duration_minutes: 480,
    default_start_time: '09:00:00',
    default_tag: 'work-work',
    default_calendar_id: 'work',
  },
  {
    id: 'qa-gym',
    shortcut: 'gym',
    default_title: 'Gym',
    default_duration_minutes: 60,
    default_start_time: '18:30:00',
    default_tag: 'family-focus',
    default_calendar_id: 'family',
  },
];
state.activeCalendarId = 'family';
state.selectedDate = today;
state.view = 'month';
state.monthEntryScope = 'all';
state.focusView = 'focus';
state.showArchivedCalendars = false;

bindElements();
setAuthenticatedView(true);
renderUser();
syncSelectedTags();
renderAll();

const els = elements();
const shot = new URLSearchParams(window.location.search).get('shot') || 'month';

if (shot === 'week') {
  state.view = 'week';
  renderAll();
}

if (shot === 'day-detail') {
  openDayDetail(today);
}

if (shot === 'day-add-menu') {
  openDayDetail(today);
  document.querySelector('.day-detail-create')?.setAttribute('open', '');
}

if (shot === 'tasks') {
  setActivePanel('tasks');
  renderAll();
}

if (shot === 'settings') {
  setActivePanel('settings');
  state.showArchivedCalendars = true;
  renderAll();
}

if (shot === 'create') {
  els.typePickerModal.showModal();
}

if (shot === 'event-form') {
  openEventModal(null, today, {
    title: 'Doctor appointment',
    starts_at: isoAt(1, 14, 0),
    ends_at: isoAt(1, 15, 0),
    tag_id: 'family-urgent',
    calendar_id: 'family',
  });
}

if (shot === 'share') {
  setActivePanel('settings');
  renderAll();
  openShareModal('family');
}

if (shot === 'quick-add') {
  setActivePanel('settings');
  renderAll();
  openQuickAddTemplateModal(state.quickAddTemplates[0]);
}

window.__GUIDE_READY__ = true;
