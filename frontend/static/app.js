'use strict';

/* ============================== Config / state ============================== */

const API_BASE = window.SMART_HOME_API_BASE || 'http://localhost:8081/api';

const state = {
  homes: [],
  users: [],
  deviceTypes: [],
  currentHomeId: null,
  view: 'overview',
};

const VIEW_META = {
  overview: { title: 'Overview', subtitle: 'Live status and quick control for the selected home' },
  devices: { title: 'Rooms & Devices', subtitle: 'Manage rooms and the devices installed in them' },
  automation: { title: 'Automation', subtitle: 'Rules that link a trigger device to an action device' },
  household: { title: 'Household', subtitle: 'People who can access this home, and the global user directory' },
  homes: { title: 'Homes', subtitle: 'All properties running the smart home system' },
  settings: { title: 'Device Types', subtitle: 'The catalog of device kinds available when adding a device' },
};

/* ============================== Fetch helper ============================== */

async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

/* ============================== DOM helpers ============================== */

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function h(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (values[i] !== undefined ? values[i] : ''), '');
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ============================== Toasts ============================== */

function toast(message, type = 'ok') {
  const root = qs('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function reportError(err) {
  console.error(err);
  toast(err.message || 'Something went wrong', 'error');
}

/* ============================== Modal ============================== */

function openModal(title, bodyHTML, { onMount, wide = false } = {}) {
  const root = qs('#modal-root');
  root.innerHTML = h`
    <div class="modal" style="${wide ? 'max-width:600px' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
      <div class="modal-header">
        <h3>${escapeHTML(title)}</h3>
        <button class="icon-btn" id="modal-close" type="button" aria-label="Close dialog">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
    </div>
  `;
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  qs('#modal-close').addEventListener('click', closeModal);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); }, { once: true });
  if (onMount) onMount(qs('.modal', root));
}

function closeModal() {
  const root = qs('#modal-root');
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '';
}

function confirmAction(message, confirmLabel, onConfirm) {
  openModal('Please confirm', h`
    <p style="margin-top:0">${escapeHTML(message)}</p>
    <div class="form-actions">
      <button class="btn" type="button" id="confirm-cancel">Cancel</button>
      <button class="btn btn-danger" type="button" id="confirm-ok">${escapeHTML(confirmLabel)}</button>
    </div>
  `, {
    onMount: (modal) => {
      qs('#confirm-cancel', modal).addEventListener('click', closeModal);
      qs('#confirm-ok', modal).addEventListener('click', async () => {
        try { await onConfirm(); closeModal(); } catch (err) { reportError(err); }
      });
    },
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && qs('#modal-root').classList.contains('is-open')) closeModal();
});

/* ============================== Device presentation helpers ============================== */

const DEVICE_ICONS = {
  lighting: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.9V16h5v-.2c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  climate: '<path d="M12 3v10.5a3.5 3.5 0 1 0 2 0V9h-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="16.5" r="1.4" fill="currentColor"/>',
  security_lock: '<rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.7"/>',
  security_camera: '<rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M15 10.5l5-2.5v8l-5-2.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  security_motion: '<path d="M4 18a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7.5 18a4.5 4.5 0 0 1 9 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="18" r="1.3" fill="currentColor"/>',
  energy: '<rect x="7" y="7" width="10" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M10 3v4M14 3v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  default: '<rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.7"/>',
};

function deviceIconKey(device) {
  const t = (device.device_type_name || '').toLowerCase();
  if (t.includes('lock')) return 'security_lock';
  if (t.includes('camera')) return 'security_camera';
  if (t.includes('motion')) return 'security_motion';
  if (device.category === 'lighting') return 'lighting';
  if (device.category === 'climate') return 'climate';
  if (device.category === 'energy') return 'energy';
  return 'default';
}

function deviceIsOn(device) {
  const s = (device.status || '').toLowerCase();
  return s === 'on' || s === 'locked' || s === 'active' || s === 'detected';
}

function parseTemp(status) {
  const n = parseFloat(String(status).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 21;
}

async function patchDevice(device, changes) {
  const body = {
    name: device.name,
    manufacturer: device.manufacturer || null,
    status: device.status,
    is_online: device.is_online,
    ...changes,
  };
  return api(`/devices/${device.device_id}`, { method: 'PUT', body: JSON.stringify(body) });
}

/** Renders one device row. `manage` adds edit/delete controls (Rooms & Devices view). */
function deviceRowHTML(device, { manage = false } = {}) {
  const iconKey = deviceIconKey(device);
  const on = deviceIsOn(device);
  const typeName = (device.device_type_name || '').toLowerCase();

  let control = '';
  if (typeName.includes('lock')) {
    control = h`
      <span class="badge ${on ? 'locked' : 'unlocked'}">${on ? 'Locked' : 'Unlocked'}</span>
      <label class="switch"><input type="checkbox" data-action="toggle-lock" data-id="${device.device_id}" ${on ? 'checked' : ''}><span class="track"><span class="thumb"></span></span></label>
    `;
  } else if (typeName.includes('camera')) {
    control = h`
      <span class="badge ${on ? 'active' : 'off'}">${on ? 'Active' : 'Off'}</span>
      <label class="switch"><input type="checkbox" data-action="toggle-camera" data-id="${device.device_id}" ${on ? 'checked' : ''}><span class="track"><span class="thumb"></span></span></label>
    `;
  } else if (typeName.includes('motion')) {
    control = h`
      <span class="badge ${on ? 'active' : 'idle'}">${on ? 'Detected' : 'Idle'}</span>
      <button class="btn btn-sm" type="button" data-action="simulate-motion" data-id="${device.device_id}">Simulate</button>
    `;
  } else if (device.category === 'climate') {
    const temp = parseTemp(device.status);
    control = h`
      <div class="stepper">
        <button type="button" data-action="temp-down" data-id="${device.device_id}" data-temp="${temp}" aria-label="Decrease temperature">&minus;</button>
        <span class="temp-value">${temp}&deg;C</span>
        <button type="button" data-action="temp-up" data-id="${device.device_id}" data-temp="${temp}" aria-label="Increase temperature">+</button>
      </div>
    `;
  } else {
    control = h`
      <span class="badge ${on ? 'on' : 'off'}">${on ? 'On' : 'Off'}</span>
      <label class="switch"><input type="checkbox" data-action="toggle-onoff" data-id="${device.device_id}" ${on ? 'checked' : ''}><span class="track"><span class="thumb"></span></span></label>
    `;
  }

  const manageControls = manage ? h`
    <button class="icon-btn btn-sm" type="button" data-action="delete-device" data-id="${device.device_id}" title="Delete device" aria-label="Delete ${escapeHTML(device.name)}">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  ` : '';

  return h`
    <div class="device-row" data-device-row="${device.device_id}">
      <div class="device-main">
        <span class="device-icon ${on ? 'on' : ''}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none">${DEVICE_ICONS[iconKey]}</svg></span>
        <div class="device-info">
          <div class="device-name" data-action="open-history" data-id="${device.device_id}" data-name="${escapeHTML(device.name)}" role="button" tabindex="0">${escapeHTML(device.name)}</div>
          <div class="device-meta">
            <span class="status-dot ${device.is_online ? 'online' : 'offline'}"></span>
            ${device.is_online ? 'Online' : 'Offline'} &middot; ${escapeHTML(device.device_type_name || '')}${device.room_name ? ' &middot; ' + escapeHTML(device.room_name) : ''}
          </div>
        </div>
      </div>
      <div class="device-controls">${control}${manageControls}</div>
    </div>
  `;
}

function wireDeviceRowActions(root, devicesById, onChanged) {
  qsa('[data-action="toggle-onoff"]', root).forEach((input) => {
    input.addEventListener('change', async () => {
      const device = devicesById[input.dataset.id];
      try {
        await patchDevice(device, { status: input.checked ? 'on' : 'off', is_online: true });
        toast(`${device.name} turned ${input.checked ? 'on' : 'off'}`);
        onChanged();
      } catch (err) { reportError(err); input.checked = !input.checked; }
    });
  });
  qsa('[data-action="toggle-lock"]', root).forEach((input) => {
    input.addEventListener('change', async () => {
      const device = devicesById[input.dataset.id];
      try {
        await patchDevice(device, { status: input.checked ? 'locked' : 'unlocked' });
        toast(`${device.name} ${input.checked ? 'locked' : 'unlocked'}`);
        onChanged();
      } catch (err) { reportError(err); input.checked = !input.checked; }
    });
  });
  qsa('[data-action="toggle-camera"]', root).forEach((input) => {
    input.addEventListener('change', async () => {
      const device = devicesById[input.dataset.id];
      try {
        await patchDevice(device, { status: input.checked ? 'active' : 'off' });
        toast(`${device.name} ${input.checked ? 'activated' : 'turned off'}`);
        onChanged();
      } catch (err) { reportError(err); input.checked = !input.checked; }
    });
  });
  qsa('[data-action="simulate-motion"]', root).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const device = devicesById[btn.dataset.id];
      try {
        await patchDevice(device, { status: 'detected' });
        await api(`/devices/${device.device_id}/events`, {
          method: 'POST',
          body: JSON.stringify({ event_type: 'motion_detected', value: 'detected' }),
        });
        toast(`${device.name}: motion detected`);
        onChanged();
      } catch (err) { reportError(err); }
    });
  });
  qsa('[data-action="temp-up"], [data-action="temp-down"]', root).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const device = devicesById[btn.dataset.id];
      const delta = btn.dataset.action === 'temp-up' ? 1 : -1;
      const next = parseTemp(device.status) + delta;
      try {
        await patchDevice(device, { status: `${next}C` });
        onChanged();
      } catch (err) { reportError(err); }
    });
  });
  qsa('[data-action="delete-device"]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const device = devicesById[btn.dataset.id];
      confirmAction(`Delete "${device.name}"? This also removes its event history and any automation rules using it.`, 'Delete device', async () => {
        await api(`/devices/${device.device_id}`, { method: 'DELETE' });
        toast(`${device.name} deleted`);
        onChanged();
      });
    });
  });
  qsa('[data-action="open-history"]', root).forEach((elx) => {
    const open = () => openDeviceHistory(devicesById[elx.dataset.id]);
    elx.addEventListener('click', open);
    elx.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
}

async function openDeviceHistory(device) {
  openModal(`${device.name} — history`, h`
    <p class="muted" style="margin-top:0">${escapeHTML(device.device_type_name || '')} &middot; ${escapeHTML(device.room_name || '')} &middot; ${escapeHTML(device.manufacturer || 'Unknown manufacturer')}</p>
    <div class="event-list" id="event-list"><p class="muted">Loading…</p></div>
    <form id="log-event-form" class="form-grid" style="margin-top:16px;grid-template-columns:1fr 1fr auto">
      <div class="form-field"><label for="ev-type">Event type</label><input id="ev-type" type="text" placeholder="state_change" required></div>
      <div class="form-field"><label for="ev-value">Value</label><input id="ev-value" type="text" placeholder="on" required></div>
      <div class="form-field" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Log</button></div>
    </form>
  `, {
    wide: true,
    onMount: async (modal) => {
      const list = qs('#event-list', modal);
      const load = async () => {
        try {
          const events = await api(`/devices/${device.device_id}/events?limit=30`);
          list.innerHTML = events.length ? events.map((e) => h`
            <div class="event-item">
              <span><span class="event-type">${escapeHTML(e.event_type)}</span> &rarr; ${escapeHTML(e.value)}</span>
              <span class="event-time">${timeAgo(e.recorded_at)}</span>
            </div>
          `).join('') : '<p class="muted">No events recorded yet.</p>';
        } catch (err) { reportError(err); }
      };
      await load();
      qs('#log-event-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api(`/devices/${device.device_id}/events`, {
            method: 'POST',
            body: JSON.stringify({ event_type: qs('#ev-type', modal).value, value: qs('#ev-value', modal).value }),
          });
          qs('#ev-type', modal).value = '';
          qs('#ev-value', modal).value = '';
          await load();
        } catch (err) { reportError(err); }
      });
    },
  });
}

/* ============================== View: Overview ============================== */

async function renderOverview() {
  const root = qs('#view-overview');
  const home = currentHome();
  if (!home) { root.innerHTML = emptyHomesState(); return; }

  root.innerHTML = '<p class="muted">Loading overview…</p>';
  try {
    const [summary, rooms, devices] = await Promise.all([
      api(`/homes/${home.home_id}/summary`),
      api(`/homes/${home.home_id}/rooms`),
      api(`/homes/${home.home_id}/devices`),
    ]);

    const devicesById = Object.fromEntries(devices.map((d) => [d.device_id, d]));
    const byRoom = {};
    devices.forEach((d) => { (byRoom[d.room_id] = byRoom[d.room_id] || []).push(d); });

    root.innerHTML = h`
      <div class="stat-grid">
        <div class="stat-card"><span class="stat-value">${summary.room_count}</span><span class="stat-label">Rooms</span></div>
        <div class="stat-card"><span class="stat-value">${summary.device_count}</span><span class="stat-label">Devices</span></div>
        <div class="stat-card accent"><span class="stat-value">${summary.online_count}</span><span class="stat-label">Online now</span></div>
        <div class="stat-card"><span class="stat-value">${summary.member_count}</span><span class="stat-label">Household members</span></div>
        <div class="stat-card"><span class="stat-value">${summary.active_rules}/${summary.total_rules}</span><span class="stat-label">Active automations</span></div>
      </div>
      <div>
        <h2 class="section-title" style="margin-bottom:16px">Live control</h2>
        <div class="room-grid" id="overview-rooms"></div>
      </div>
    `;

    const grid = qs('#overview-rooms');
    if (!rooms.length) {
      grid.innerHTML = `<div class="empty-state card">No rooms yet. Add one from the "Rooms & Devices" tab.</div>`;
      return;
    }
    grid.innerHTML = rooms.map((room) => {
      const list = byRoom[room.room_id] || [];
      return h`
        <div class="card room-card">
          <div class="room-card-title">
            <h3>${escapeHTML(room.name)}</h3>
            <span class="floor-badge">Floor ${room.floor}</span>
          </div>
          ${list.length ? list.map((d) => deviceRowHTML(d)).join('') : '<p class="muted">No devices in this room.</p>'}
        </div>
      `;
    }).join('');
    wireDeviceRowActions(grid, devicesById, renderOverview);
  } catch (err) { reportError(err); root.innerHTML = '<p class="muted">Could not load overview.</p>'; }
}

/* ============================== View: Rooms & Devices ============================== */

async function renderDevices() {
  const root = qs('#view-devices');
  const home = currentHome();
  if (!home) { root.innerHTML = emptyHomesState(); return; }

  root.innerHTML = '<p class="muted">Loading rooms…</p>';
  try {
    const [rooms, devices] = await Promise.all([
      api(`/homes/${home.home_id}/rooms`),
      api(`/homes/${home.home_id}/devices`),
    ]);
    const devicesById = Object.fromEntries(devices.map((d) => [d.device_id, d]));
    const byRoom = {};
    devices.forEach((d) => { (byRoom[d.room_id] = byRoom[d.room_id] || []).push(d); });

    root.innerHTML = `<div class="room-grid" id="manage-rooms"></div>`;
    const grid = qs('#manage-rooms');

    grid.innerHTML = (rooms.length ? rooms.map((room) => {
      const list = byRoom[room.room_id] || [];
      return h`
        <div class="card room-card">
          <div class="room-card-title">
            <h3>${escapeHTML(room.name)} <span class="floor-badge">Floor ${room.floor}</span></h3>
            <div style="display:flex;gap:6px">
              <button class="icon-btn" type="button" data-action="edit-room" data-id="${room.room_id}" title="Edit room" aria-label="Edit ${escapeHTML(room.name)}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L18.5 9.5a1.5 1.5 0 0 0 0-2.1l-1.9-1.9a1.5 1.5 0 0 0-2.1 0L4 15v5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
              </button>
              <button class="icon-btn" type="button" data-action="delete-room" data-id="${room.room_id}" title="Delete room" aria-label="Delete ${escapeHTML(room.name)}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>
          ${list.length ? list.map((d) => deviceRowHTML(d, { manage: true })).join('') : '<p class="muted">No devices yet.</p>'}
          <button class="btn btn-sm" type="button" data-action="add-device" data-room="${room.room_id}" data-room-name="${escapeHTML(room.name)}">+ Add device</button>
        </div>
      `;
    }).join('') : '') + `
      <div class="card" style="display:flex;align-items:center;justify-content:center;min-height:160px">
        <button class="btn btn-primary" type="button" id="add-room-btn">+ Add room</button>
      </div>
    `;

    wireDeviceRowActions(grid, devicesById, renderDevices);

    qsa('[data-action="add-device"]', grid).forEach((btn) => {
      btn.addEventListener('click', () => openDeviceForm(btn.dataset.room, btn.dataset.roomName));
    });
    qsa('[data-action="edit-room"]', grid).forEach((btn) => {
      const room = rooms.find((r) => String(r.room_id) === btn.dataset.id);
      btn.addEventListener('click', () => openRoomForm(home.home_id, room));
    });
    qsa('[data-action="delete-room"]', grid).forEach((btn) => {
      const room = rooms.find((r) => String(r.room_id) === btn.dataset.id);
      btn.addEventListener('click', () => {
        confirmAction(`Delete room "${room.name}"? Its devices will be deleted too.`, 'Delete room', async () => {
          await api(`/rooms/${room.room_id}`, { method: 'DELETE' });
          toast(`${room.name} deleted`);
          renderDevices();
        });
      });
    });
    qs('#add-room-btn').addEventListener('click', () => openRoomForm(home.home_id));
  } catch (err) { reportError(err); root.innerHTML = '<p class="muted">Could not load rooms.</p>'; }
}

function openRoomForm(homeId, room) {
  const editing = !!room;
  openModal(editing ? 'Edit room' : 'Add room', h`
    <form id="room-form" class="form-grid" style="grid-template-columns:2fr 1fr">
      <div class="form-field"><label for="room-name">Name</label><input id="room-name" type="text" value="${editing ? escapeHTML(room.name) : ''}" required></div>
      <div class="form-field"><label for="room-floor">Floor</label><input id="room-floor" type="number" value="${editing ? room.floor : 0}" required></div>
      <div class="form-actions" style="grid-column:1/-1">
        <button class="btn" type="button" id="room-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">${editing ? 'Save' : 'Add room'}</button>
      </div>
    </form>
  `, {
    onMount: (modal) => {
      qs('#room-cancel', modal).addEventListener('click', closeModal);
      qs('#room-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { name: qs('#room-name', modal).value, floor: Number(qs('#room-floor', modal).value) };
        try {
          if (editing) await api(`/rooms/${room.room_id}`, { method: 'PUT', body: JSON.stringify(body) });
          else await api(`/homes/${homeId}/rooms`, { method: 'POST', body: JSON.stringify(body) });
          toast(editing ? 'Room updated' : 'Room added');
          closeModal();
          renderDevices();
        } catch (err) { reportError(err); }
      });
    },
  });
}

async function openDeviceForm(roomId, roomName) {
  if (!state.deviceTypes.length) {
    try { state.deviceTypes = await api('/device-types'); } catch (err) { reportError(err); return; }
  }
  openModal(`Add device to ${roomName}`, h`
    <form id="device-form" class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-field" style="grid-column:1/-1"><label for="dev-name">Device name</label><input id="dev-name" type="text" placeholder="e.g. Hallway Light" required></div>
      <div class="form-field"><label for="dev-type">Device type</label>
        <select id="dev-type" required>${state.deviceTypes.map((t) => `<option value="${t.device_type_id}">${escapeHTML(t.name)}</option>`).join('')}</select>
      </div>
      <div class="form-field"><label for="dev-manufacturer">Manufacturer</label><input id="dev-manufacturer" type="text" placeholder="Optional"></div>
      <div class="form-actions" style="grid-column:1/-1">
        <button class="btn" type="button" id="device-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">Add device</button>
      </div>
    </form>
  `, {
    onMount: (modal) => {
      qs('#device-cancel', modal).addEventListener('click', closeModal);
      qs('#device-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
          device_type_id: Number(qs('#dev-type', modal).value),
          name: qs('#dev-name', modal).value,
          manufacturer: qs('#dev-manufacturer', modal).value || null,
          status: 'off',
        };
        try {
          await api(`/rooms/${roomId}/devices`, { method: 'POST', body: JSON.stringify(body) });
          toast('Device added');
          closeModal();
          renderDevices();
        } catch (err) { reportError(err); }
      });
    },
  });
}

/* ============================== View: Automation ============================== */

async function renderAutomation() {
  const root = qs('#view-automation');
  const home = currentHome();
  if (!home) { root.innerHTML = emptyHomesState(); return; }

  root.innerHTML = '<p class="muted">Loading rules…</p>';
  try {
    const [rules, devices, members] = await Promise.all([
      api(`/homes/${home.home_id}/rules`),
      api(`/homes/${home.home_id}/devices`),
      api(`/homes/${home.home_id}/members`),
    ]);

    root.innerHTML = h`
      <div class="card">
        <div class="card-header">
          <h2>Automation rules</h2>
          <button class="btn btn-primary" type="button" id="add-rule-btn" ${devices.length < 1 ? 'disabled' : ''}>+ Add rule</button>
        </div>
        <div id="rules-table"></div>
      </div>
    `;

    const table = qs('#rules-table');
    if (!rules.length) {
      table.innerHTML = `<div class="empty-state">No automation rules yet for this home.</div>`;
    } else {
      table.innerHTML = h`
        <div class="table-wrap"><table>
          <thead><tr><th>Rule</th><th>Trigger</th><th>Action</th><th>Author</th><th>Status</th><th></th></tr></thead>
          <tbody>${rules.map((rule) => h`
            <tr data-rule="${rule.rule_id}">
              <td>${escapeHTML(rule.name)}</td>
              <td>${escapeHTML(rule.trigger_device_name)}<br><span class="muted" style="font-size:.78rem">${escapeHTML(rule.trigger_condition)}</span></td>
              <td>${escapeHTML(rule.action_device_name)}<br><span class="muted" style="font-size:.78rem">${escapeHTML(rule.action_command)}</span></td>
              <td>${escapeHTML(rule.created_by_name)}</td>
              <td>
                <label class="switch"><input type="checkbox" data-action="toggle-rule" data-id="${rule.rule_id}" ${rule.is_enabled ? 'checked' : ''}><span class="track"><span class="thumb"></span></span></label>
              </td>
              <td class="actions">
                <button class="icon-btn btn-sm" type="button" data-action="delete-rule" data-id="${rule.rule_id}" title="Delete rule" aria-label="Delete rule ${escapeHTML(rule.name)}">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </td>
            </tr>
          `).join('')}</tbody>
        </table></div>
      `;
    }

    qsa('[data-action="toggle-rule"]', table).forEach((input) => {
      input.addEventListener('change', async () => {
        const rule = rules.find((r) => String(r.rule_id) === input.dataset.id);
        try {
          await api(`/rules/${rule.rule_id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: rule.name, trigger_condition: rule.trigger_condition, action_command: rule.action_command, is_enabled: input.checked }),
          });
          toast(`"${rule.name}" ${input.checked ? 'enabled' : 'disabled'}`);
        } catch (err) { reportError(err); input.checked = !input.checked; }
      });
    });
    qsa('[data-action="delete-rule"]', table).forEach((btn) => {
      const rule = rules.find((r) => String(r.rule_id) === btn.dataset.id);
      btn.addEventListener('click', () => {
        confirmAction(`Delete rule "${rule.name}"?`, 'Delete rule', async () => {
          await api(`/rules/${rule.rule_id}`, { method: 'DELETE' });
          toast('Rule deleted');
          renderAutomation();
        });
      });
    });

    qs('#add-rule-btn').addEventListener('click', () => openRuleForm(home.home_id, devices, members));
  } catch (err) { reportError(err); root.innerHTML = '<p class="muted">Could not load automation rules.</p>'; }
}

function openRuleForm(homeId, devices, members) {
  const deviceOptions = devices.map((d) => `<option value="${d.device_id}">${escapeHTML(d.name)} (${escapeHTML(d.room_name)})</option>`).join('');
  const authorOptions = members.map((m) => `<option value="${m.user_id}">${escapeHTML(m.full_name)}</option>`).join('');
  openModal('Add automation rule', h`
    <form id="rule-form" class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-field" style="grid-column:1/-1"><label for="rule-name">Rule name</label><input id="rule-name" type="text" placeholder="e.g. Turn on porch light" required></div>
      <div class="form-field"><label for="rule-trigger-device">Trigger device</label><select id="rule-trigger-device" required>${deviceOptions}</select></div>
      <div class="form-field"><label for="rule-trigger-condition">Trigger condition</label><input id="rule-trigger-condition" type="text" placeholder="e.g. motion = detected" required></div>
      <div class="form-field"><label for="rule-action-device">Action device</label><select id="rule-action-device" required>${deviceOptions}</select></div>
      <div class="form-field"><label for="rule-action-command">Action command</label><input id="rule-action-command" type="text" placeholder="e.g. turn_on" required></div>
      <div class="form-field" style="grid-column:1/-1"><label for="rule-author">Created by</label><select id="rule-author" required>${authorOptions}</select></div>
      <div class="form-actions" style="grid-column:1/-1">
        <button class="btn" type="button" id="rule-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">Add rule</button>
      </div>
    </form>
  `, {
    wide: true,
    onMount: (modal) => {
      qs('#rule-cancel', modal).addEventListener('click', closeModal);
      qs('#rule-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
          created_by: Number(qs('#rule-author', modal).value),
          name: qs('#rule-name', modal).value,
          trigger_device_id: Number(qs('#rule-trigger-device', modal).value),
          trigger_condition: qs('#rule-trigger-condition', modal).value,
          action_device_id: Number(qs('#rule-action-device', modal).value),
          action_command: qs('#rule-action-command', modal).value,
        };
        try {
          await api(`/homes/${homeId}/rules`, { method: 'POST', body: JSON.stringify(body) });
          toast('Rule added');
          closeModal();
          renderAutomation();
        } catch (err) { reportError(err); }
      });
    },
  });
}

/* ============================== View: Household ============================== */

async function renderHousehold() {
  const root = qs('#view-household');
  const home = currentHome();
  if (!home) { root.innerHTML = emptyHomesState(); return; }

  root.innerHTML = '<p class="muted">Loading household…</p>';
  try {
    const [members, allUsers] = await Promise.all([
      api(`/homes/${home.home_id}/members`),
      api('/users'),
    ]);
    state.users = allUsers;

    const memberIds = new Set(members.map((m) => m.user_id));
    const nonMembers = allUsers.filter((u) => !memberIds.has(u.user_id));

    root.innerHTML = h`
      <div class="card">
        <div class="card-header">
          <h2>Members of ${escapeHTML(home.name)}</h2>
          <button class="btn btn-primary" type="button" id="add-member-btn" ${nonMembers.length < 1 ? 'disabled title="All users already belong to this home"' : ''}>+ Add member</button>
        </div>
        <div id="members-table"></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h2>All users</h2>
          <button class="btn btn-primary" type="button" id="add-user-btn">+ New user</button>
        </div>
        <div id="users-table"></div>
      </div>
    `;

    const membersTable = qs('#members-table');
    membersTable.innerHTML = members.length ? h`
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
        <tbody>${members.map((m) => h`
          <tr>
            <td>${escapeHTML(m.full_name)}</td>
            <td>${escapeHTML(m.email)}</td>
            <td>
              <select data-action="member-role" data-user="${m.user_id}" style="width:auto;padding:6px 10px">
                ${['owner', 'member', 'guest'].map((r) => `<option value="${r}" ${r === m.role ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}
              </select>
            </td>
            <td>${new Date(m.joined_at).toLocaleDateString()}</td>
            <td class="actions">
              <button class="icon-btn btn-sm" type="button" data-action="remove-member" data-user="${m.user_id}" data-name="${escapeHTML(m.full_name)}" title="Remove from home" aria-label="Remove ${escapeHTML(m.full_name)}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    ` : '<div class="empty-state">No members yet.</div>';

    qsa('[data-action="member-role"]', membersTable).forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          await api(`/homes/${home.home_id}/members/${sel.dataset.user}`, { method: 'PUT', body: JSON.stringify({ role: sel.value }) });
          toast('Role updated');
        } catch (err) { reportError(err); renderHousehold(); }
      });
    });
    qsa('[data-action="remove-member"]', membersTable).forEach((btn) => {
      btn.addEventListener('click', () => {
        confirmAction(`Remove ${btn.dataset.name} from ${home.name}?`, 'Remove', async () => {
          await api(`/homes/${home.home_id}/members/${btn.dataset.user}`, { method: 'DELETE' });
          toast('Member removed');
          renderHousehold();
        });
      });
    });
    qs('#add-member-btn').addEventListener('click', () => openMemberForm(home, nonMembers));

    const usersTable = qs('#users-table');
    usersTable.innerHTML = allUsers.length ? h`
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th></th></tr></thead>
        <tbody>${allUsers.map((u) => h`
          <tr>
            <td>${escapeHTML(u.full_name)}</td>
            <td>${escapeHTML(u.email)}</td>
            <td>${escapeHTML(u.phone || '—')}</td>
            <td class="actions">
              <button class="icon-btn btn-sm" type="button" data-action="delete-user" data-id="${u.user_id}" data-name="${escapeHTML(u.full_name)}" title="Delete user" aria-label="Delete ${escapeHTML(u.full_name)}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    ` : '<div class="empty-state">No users yet.</div>';

    qsa('[data-action="delete-user"]', usersTable).forEach((btn) => {
      btn.addEventListener('click', () => {
        confirmAction(`Delete user ${btn.dataset.name}? This removes their memberships too.`, 'Delete user', async () => {
          await api(`/users/${btn.dataset.id}`, { method: 'DELETE' });
          toast('User deleted');
          renderHousehold();
        });
      });
    });
    qs('#add-user-btn').addEventListener('click', () => openUserForm());
  } catch (err) { reportError(err); root.innerHTML = '<p class="muted">Could not load household.</p>'; }
}

function openMemberForm(home, nonMembers) {
  openModal(`Add member to ${home.name}`, h`
    <form id="member-form" class="form-grid" style="grid-template-columns:2fr 1fr">
      <div class="form-field"><label for="member-user">User</label>
        <select id="member-user" required>${nonMembers.map((u) => `<option value="${u.user_id}">${escapeHTML(u.full_name)} (${escapeHTML(u.email)})</option>`).join('')}</select>
      </div>
      <div class="form-field"><label for="member-role">Role</label>
        <select id="member-role" required><option value="member">Member</option><option value="owner">Owner</option><option value="guest">Guest</option></select>
      </div>
      <div class="form-actions" style="grid-column:1/-1">
        <button class="btn" type="button" id="member-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">Add member</button>
      </div>
    </form>
  `, {
    onMount: (modal) => {
      qs('#member-cancel', modal).addEventListener('click', closeModal);
      qs('#member-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api(`/homes/${home.home_id}/members`, {
            method: 'POST',
            body: JSON.stringify({ user_id: Number(qs('#member-user', modal).value), role: qs('#member-role', modal).value }),
          });
          toast('Member added');
          closeModal();
          renderHousehold();
        } catch (err) { reportError(err); }
      });
    },
  });
}

function openUserForm() {
  openModal('New user', h`
    <form id="user-form" class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-field" style="grid-column:1/-1"><label for="user-name">Full name</label><input id="user-name" type="text" required></div>
      <div class="form-field"><label for="user-email">Email</label><input id="user-email" type="email" required></div>
      <div class="form-field"><label for="user-phone">Phone</label><input id="user-phone" type="tel" placeholder="Optional"></div>
      <div class="form-actions" style="grid-column:1/-1">
        <button class="btn" type="button" id="user-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">Create user</button>
      </div>
    </form>
  `, {
    onMount: (modal) => {
      qs('#user-cancel', modal).addEventListener('click', closeModal);
      qs('#user-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('/users', {
            method: 'POST',
            body: JSON.stringify({
              full_name: qs('#user-name', modal).value,
              email: qs('#user-email', modal).value,
              phone: qs('#user-phone', modal).value || null,
            }),
          });
          toast('User created');
          closeModal();
          renderHousehold();
        } catch (err) { reportError(err); }
      });
    },
  });
}

/* ============================== View: Homes ============================== */

async function renderHomes() {
  const root = qs('#view-homes');
  root.innerHTML = '<p class="muted">Loading homes…</p>';
  try {
    const homes = await api('/homes');
    state.homes = homes;
    populateHomeSelect();

    root.innerHTML = h`
      <div class="card">
        <div class="card-header">
          <h2>Properties</h2>
          <button class="btn btn-primary" type="button" id="add-home-btn">+ Add home</button>
        </div>
        <div id="homes-table"></div>
      </div>
    `;
    const table = qs('#homes-table');
    table.innerHTML = homes.length ? h`
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Address</th><th>Timezone</th><th></th></tr></thead>
        <tbody>${homes.map((home) => h`
          <tr>
            <td>${escapeHTML(home.name)}</td>
            <td>${escapeHTML(home.address)}</td>
            <td>${escapeHTML(home.timezone)}</td>
            <td class="actions">
              <button class="icon-btn btn-sm" type="button" data-action="edit-home" data-id="${home.home_id}" title="Edit home" aria-label="Edit ${escapeHTML(home.name)}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L18.5 9.5a1.5 1.5 0 0 0 0-2.1l-1.9-1.9a1.5 1.5 0 0 0-2.1 0L4 15v5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
              </button>
              <button class="icon-btn btn-sm" type="button" data-action="delete-home" data-id="${home.home_id}" title="Delete home" aria-label="Delete ${escapeHTML(home.name)}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    ` : '<div class="empty-state">No homes yet.</div>';

    qsa('[data-action="edit-home"]', table).forEach((btn) => {
      const home = homes.find((hm) => String(hm.home_id) === btn.dataset.id);
      btn.addEventListener('click', () => openHomeForm(home));
    });
    qsa('[data-action="delete-home"]', table).forEach((btn) => {
      const home = homes.find((hm) => String(hm.home_id) === btn.dataset.id);
      btn.addEventListener('click', () => {
        confirmAction(`Delete "${home.name}"? This deletes all its rooms, devices, members and rules.`, 'Delete home', async () => {
          await api(`/homes/${home.home_id}`, { method: 'DELETE' });
          toast(`${home.name} deleted`);
          if (state.currentHomeId === home.home_id) state.currentHomeId = null;
          await bootstrapHomes();
          renderHomes();
        });
      });
    });
    qs('#add-home-btn').addEventListener('click', () => openHomeForm());
  } catch (err) { reportError(err); root.innerHTML = '<p class="muted">Could not load homes.</p>'; }
}

function openHomeForm(home) {
  const editing = !!home;
  openModal(editing ? 'Edit home' : 'Add home', h`
    <form id="home-form" class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-field" style="grid-column:1/-1"><label for="home-name-input">Name</label><input id="home-name-input" type="text" value="${editing ? escapeHTML(home.name) : ''}" required></div>
      <div class="form-field" style="grid-column:1/-1"><label for="home-address">Address</label><input id="home-address" type="text" value="${editing ? escapeHTML(home.address) : ''}" required></div>
      <div class="form-field" style="grid-column:1/-1"><label for="home-tz">Timezone</label><input id="home-tz" type="text" value="${editing ? escapeHTML(home.timezone) : 'Africa/Lagos'}" required></div>
      <div class="form-actions" style="grid-column:1/-1">
        <button class="btn" type="button" id="home-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">${editing ? 'Save' : 'Add home'}</button>
      </div>
    </form>
  `, {
    onMount: (modal) => {
      qs('#home-cancel', modal).addEventListener('click', closeModal);
      qs('#home-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
          name: qs('#home-name-input', modal).value,
          address: qs('#home-address', modal).value,
          timezone: qs('#home-tz', modal).value,
        };
        try {
          if (editing) await api(`/homes/${home.home_id}`, { method: 'PUT', body: JSON.stringify(body) });
          else await api('/homes', { method: 'POST', body: JSON.stringify(body) });
          toast(editing ? 'Home updated' : 'Home added');
          closeModal();
          await bootstrapHomes();
          renderHomes();
        } catch (err) { reportError(err); }
      });
    },
  });
}

/* ============================== View: Settings (device types) ============================== */

async function renderSettings() {
  const root = qs('#view-settings');
  root.innerHTML = '<p class="muted">Loading device types…</p>';
  try {
    const types = await api('/device-types');
    state.deviceTypes = types;

    root.innerHTML = h`
      <div class="card">
        <div class="card-header">
          <h2>Device type catalog</h2>
          <button class="btn btn-primary" type="button" id="add-type-btn">+ Add device type</button>
        </div>
        <div id="types-table"></div>
      </div>
    `;
    const table = qs('#types-table');
    table.innerHTML = types.length ? h`
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Category</th><th></th></tr></thead>
        <tbody>${types.map((t) => h`
          <tr>
            <td>${escapeHTML(t.name)}</td>
            <td><span class="badge">${escapeHTML(t.category)}</span></td>
            <td class="actions">
              <button class="icon-btn btn-sm" type="button" data-action="delete-type" data-id="${t.device_type_id}" data-name="${escapeHTML(t.name)}" title="Delete type" aria-label="Delete ${escapeHTML(t.name)}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    ` : '<div class="empty-state">No device types yet.</div>';

    qsa('[data-action="delete-type"]', table).forEach((btn) => {
      btn.addEventListener('click', () => {
        confirmAction(`Delete device type "${btn.dataset.name}"? It must not be in use by any device.`, 'Delete type', async () => {
          await api(`/device-types/${btn.dataset.id}`, { method: 'DELETE' });
          toast('Device type deleted');
          renderSettings();
        });
      });
    });
    qs('#add-type-btn').addEventListener('click', openDeviceTypeForm);
  } catch (err) { reportError(err); root.innerHTML = '<p class="muted">Could not load device types.</p>'; }
}

function openDeviceTypeForm() {
  openModal('Add device type', h`
    <form id="type-form" class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-field"><label for="type-name">Name</label><input id="type-name" type="text" placeholder="e.g. Smart Blinds" required></div>
      <div class="form-field"><label for="type-category">Category</label>
        <select id="type-category" required>
          <option value="lighting">Lighting</option>
          <option value="climate">Climate</option>
          <option value="security">Security</option>
          <option value="energy">Energy</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-actions" style="grid-column:1/-1">
        <button class="btn" type="button" id="type-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">Add type</button>
      </div>
    </form>
  `, {
    onMount: (modal) => {
      qs('#type-cancel', modal).addEventListener('click', closeModal);
      qs('#type-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('/device-types', {
            method: 'POST',
            body: JSON.stringify({ name: qs('#type-name', modal).value, category: qs('#type-category', modal).value }),
          });
          toast('Device type added');
          closeModal();
          renderSettings();
        } catch (err) { reportError(err); }
      });
    },
  });
}

/* ============================== Shared bits ============================== */

function currentHome() {
  return state.homes.find((home) => home.home_id === state.currentHomeId) || null;
}

function emptyHomesState() {
  return h`
    <div class="empty-state card">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.5"/></svg>
      <p>No home selected yet. Add one from the <strong>Homes</strong> tab to get started.</p>
    </div>
  `;
}

function populateHomeSelect() {
  const select = qs('#home-select');
  select.innerHTML = state.homes.map((home) => `<option value="${home.home_id}">${escapeHTML(home.name)}</option>`).join('');
  if (!state.homes.length) return;
  if (!state.currentHomeId || !state.homes.some((h2) => h2.home_id === state.currentHomeId)) {
    state.currentHomeId = state.homes[0].home_id;
  }
  select.value = state.currentHomeId;
}

const VIEW_RENDERERS = {
  overview: renderOverview,
  devices: renderDevices,
  automation: renderAutomation,
  household: renderHousehold,
  homes: renderHomes,
  settings: renderSettings,
};

function setView(view) {
  state.view = view;
  qsa('.nav-item').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === view));
  qsa('.view').forEach((sec) => sec.classList.toggle('is-active', sec.id === `view-${view}`));
  qs('#view-title').textContent = VIEW_META[view].title;
  qs('#view-subtitle').textContent = VIEW_META[view].subtitle;
  qs('#sidebar').classList.remove('is-open');
  VIEW_RENDERERS[view]();
}

async function bootstrapHomes() {
  state.homes = await api('/homes');
  populateHomeSelect();
}

async function checkApiHealth() {
  const dot = qs('#api-status');
  const label = qs('#api-status-label');
  try {
    await api('/health');
    dot.className = 'api-dot online';
    label.textContent = 'API connected';
  } catch (err) {
    dot.className = 'api-dot offline';
    label.textContent = 'API unreachable';
  }
}

/* ============================== Init ============================== */

function init() {
  qsa('.nav-item').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));

  qs('#home-select').addEventListener('change', (e) => {
    state.currentHomeId = Number(e.target.value);
    VIEW_RENDERERS[state.view]();
  });

  qs('#menu-toggle').addEventListener('click', () => {
    const sidebar = qs('#sidebar');
    const open = sidebar.classList.toggle('is-open');
    qs('#menu-toggle').setAttribute('aria-expanded', String(open));
  });

  checkApiHealth();
  setInterval(checkApiHealth, 20000);

  bootstrapHomes()
    .then(() => setView('overview'))
    .catch((err) => {
      reportError(err);
      qs('#view-overview').innerHTML = h`
        <div class="empty-state card">
          <p>Could not reach the Smart Home API at <code>${escapeHTML(API_BASE)}</code>.</p>
          <p class="muted">Make sure the Go backend server is running.</p>
        </div>
      `;
      qs('#view-overview').classList.add('is-active');
    });
}

document.addEventListener('DOMContentLoaded', init);
