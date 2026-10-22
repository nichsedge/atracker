export const formatDuration = (secs) => {
  if (secs === null || secs === undefined || isNaN(secs)) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(secs)}s`;
};

export const formatTime = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const formatLocalDateISO = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const shiftDate = (isoDateString, days) => {
  if (!isoDateString || typeof isoDateString !== 'string') {
    return formatLocalDateISO();
  }
  const parts = isoDateString.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return formatLocalDateISO();
  }
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatLocalDateISO(date);
};
