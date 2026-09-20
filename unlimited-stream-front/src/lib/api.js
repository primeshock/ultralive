export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050";
export const MEDIA_URL = process.env.NEXT_PUBLIC_MEDIA_URL || "http://localhost:8000";
export const RTMP_URL = process.env.NEXT_PUBLIC_RTMP_URL || "rtmp://localhost:1935/live";
const API_TIMEOUT_MS = 15000;

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
      signal: options.signal || controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "درخواست با خطا مواجه شد");
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function apiUpload(path, formData) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      body: formData,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "آپلود با خطا مواجه شد");
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  register: (username, password) =>
    apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username, password) =>
    apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => apiFetch("/api/auth/logout", { method: "POST" }),
  me: () => apiFetch("/api/auth/me"),
  updateProfile: (payload) =>
    apiFetch("/api/user/profile", { method: "PATCH", body: JSON.stringify(payload) }),
  regenerateKey: () => apiFetch("/api/user/regenerate-key", { method: "POST" }),
  toggleChat: (enabled) =>
    apiFetch("/api/user/chat-toggle", { method: "POST", body: JSON.stringify({ enabled }) }),
  muteUser: (username) => apiFetch("/api/user/mute", { method: "POST", body: JSON.stringify({ username }) }),
  unmuteUser: (username) => apiFetch("/api/user/unmute", { method: "POST", body: JSON.stringify({ username }) }),
  uploadThumbnail: (file) => {
    const formData = new FormData();
    formData.append("thumbnail", file);
    return apiUpload("/api/user/thumbnail", formData);
  },
  site: () => apiFetch("/api/site"),
  uploadFavicon: (file) => {
    const formData = new FormData();
    formData.append("favicon", file);
    return apiUpload("/api/master/favicon", formData);
  },
  channel: (username) => apiFetch(`/api/streams/${username}`),

  // --- Master panel (owner) ---
  createAdmin: (username, password) =>
    apiFetch("/api/master/admins", { method: "POST", body: JSON.stringify({ username, password }) }),
  listAdmins: () => apiFetch("/api/master/admins"),
  updateOwnerCredentials: (payload) =>
    apiFetch("/api/master/owner-credentials", { method: "PATCH", body: JSON.stringify(payload) }),
  updateAdmin: (id, payload) =>
    apiFetch(`/api/master/admins/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAdmin: (id) => apiFetch(`/api/master/admins/${id}`, { method: "DELETE" }),
  createChannel: (payload) => apiFetch("/api/master/channels", { method: "POST", body: JSON.stringify(payload) }),
  listAllChannels: () => apiFetch("/api/master/channels"),
  deleteChannel: (id) => apiFetch(`/api/master/channels/${id}`, { method: "DELETE" }),
  getSettings: () => apiFetch("/api/master/settings"),
  updateSettings: (payload) => apiFetch("/api/master/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  uploadLogo: (file) => {
    const formData = new FormData();
    formData.append("logo", file);
    return apiUpload("/api/master/logo", formData);
  },
  uploadBackground: (file) => {
    const formData = new FormData();
    formData.append("background", file);
    return apiUpload("/api/master/appearance/background", formData);
  },
  removeBackground: () => apiFetch("/api/master/appearance/background", { method: "DELETE" }),
  systemStats: () => apiFetch("/api/master/system-stats"),
  telemetry: (limit = 360) => apiFetch(`/api/master/telemetry?limit=${encodeURIComponent(limit)}`),
  loadTestProfiles: () => apiFetch("/api/master/load-tests/profiles"),
  loadTests: () => apiFetch("/api/master/load-tests"),
  loadTest: (testId) => apiFetch(`/api/master/load-tests/${encodeURIComponent(testId)}`),
  startLoadTest: (payload) => apiFetch("/api/master/load-tests/start", { method: "POST", body: JSON.stringify(payload) }),
  stopLoadTest: (testId) => apiFetch(`/api/master/load-tests/${encodeURIComponent(testId)}/stop`, { method: "POST" }),
  activityLog: () => apiFetch("/api/master/activity"),
  organizations: () => apiFetch("/api/organizations"),
  createOrganization: (payload) => apiFetch("/api/organizations", { method: "POST", body: JSON.stringify(payload) }),
  updateOrganization: (id, payload) => apiFetch(`/api/organizations/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteOrganization: (id) => apiFetch(`/api/organizations/${id}`, { method: "DELETE" }),
  updateOrganizationOwner: (id, payload) => apiFetch(`/api/organizations/${id}/owner`, { method: "PATCH", body: JSON.stringify(payload) }),
  enterOrganization: (id) => apiFetch(`/api/organizations/${id}/context`, { method: "POST" }),
  exitOrganization: () => apiFetch("/api/organizations/context", { method: "DELETE" }),

  // --- Phase 3 management, backed by the Phase 2 class models ---
  phase2Classes: () => apiFetch("/api/classes"),
  createPhase2Class: (payload) => apiFetch("/api/classes", { method: "POST", body: JSON.stringify(payload) }),
  updatePhase2Class: (classId, payload) => apiFetch(`/api/classes/${classId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deletePhase2Class: (classId) => apiFetch(`/api/classes/${classId}`, { method: "DELETE" }),
  phase2Sessions: (classId) => apiFetch(`/api/classes/${classId}/sessions`),
  createPhase2Session: (classId, payload) => apiFetch(`/api/classes/${classId}/sessions`, { method: "POST", body: JSON.stringify(payload) }),
  phase2Attendance: (sessionId) => apiFetch(`/api/sessions/${sessionId}/attendance`),
  phase2Notes: (classId) => apiFetch(`/api/classes/${classId}/notes`),
  createPhase2Note: (classId, content) => apiFetch(`/api/classes/${classId}/notes`, { method: "POST", body: JSON.stringify({ content }) }),
  classModeration: (classId) => apiFetch(`/api/classes/${classId}/moderation`),
  moderateStudent: (classId, payload) => apiFetch(`/api/classes/${classId}/moderation`, { method: "POST", body: JSON.stringify(payload) }),
  removeClassModeration: (classId, moderationId) => apiFetch(`/api/classes/${classId}/moderation/${moderationId}`, { method: "DELETE" }),

  // --- Admin panel (admin + owner) ---
  myManagedChannels: () => apiFetch("/api/admin/channels"),
  createManagedChannel: (payload) => apiFetch("/api/admin/channels", { method: "POST", body: JSON.stringify(payload) }),
  updateManagedChannel: (channel, payload) =>
    apiFetch(`/api/admin/channels/${channel}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteManagedChannel: (channel) => apiFetch(`/api/admin/channels/${channel}`, { method: "DELETE" }),
  setChatMode: (channel, chatMode) =>
    apiFetch(`/api/admin/channels/${channel}/chat-mode`, { method: "POST", body: JSON.stringify({ chatMode }) }),
  setViewerCount: (channel, enabled) =>
    apiFetch(`/api/admin/channels/${channel}/viewer-count`, { method: "POST", body: JSON.stringify({ enabled }) }),
  clearChat: (channel) => apiFetch(`/api/admin/channels/${channel}/clear-chat`, { method: "POST" }),
  endSession: (channel) => apiFetch(`/api/admin/channels/${channel}/end-session`, { method: "POST" }),
  setClassAccess: (channel, mode, regenerate = false) => apiFetch(`/api/admin/channels/${channel}/access`, { method: "POST", body: JSON.stringify({ mode, regenerate }) }),
  classAccess: (channel) => apiFetch(`/api/session/access/${channel}`),
  uploadChannelThumbnail: (channel, file) => {
    const formData = new FormData();
    formData.append("thumbnail", file);
    return apiUpload(`/api/admin/channels/${channel}/thumbnail`, formData);
  },
  createTestLink: (channel, displayName) =>
    apiFetch(`/api/admin/channels/${channel}/test-link`, { method: "POST", body: JSON.stringify({ displayName }) }),
  activeStudents: (channel) => apiFetch(`/api/admin/channels/${channel}/active-students`),
  attendance: (channel, date) => apiFetch(`/api/admin/channels/${channel}/attendance${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  attendanceDates: (channel) => apiFetch(`/api/admin/channels/${channel}/attendance-dates`),
  createMonitorLink: (channel) => apiFetch(`/api/admin/channels/${channel}/monitor-link`, { method: "POST" }),
  revokeMonitorLink: (channel) => apiFetch(`/api/admin/channels/${channel}/monitor-link`, { method: "DELETE" }),
  moderate: (channel, payload) =>
    apiFetch(`/api/admin/channels/${channel}/moderation`, { method: "POST", body: JSON.stringify(payload) }),
  listModeration: (channel) => apiFetch(`/api/admin/channels/${channel}/moderation`),
  removeModeration: (id) => apiFetch(`/api/admin/moderation/${id}`, { method: "DELETE" }),

  // --- Polls / quizzes ---
  createPoll: (channel, payload) =>
    apiFetch(`/api/admin/channels/${channel}/polls`, { method: "POST", body: JSON.stringify(payload) }),
  listPolls: (channel) => apiFetch(`/api/admin/channels/${channel}/polls`),
  addPollOption: (pollId, payload) =>
    apiFetch(`/api/admin/polls/${pollId}/options`, { method: "POST", body: JSON.stringify(payload) }),
  updatePoll: (pollId, payload) =>
    apiFetch(`/api/admin/polls/${pollId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  removePollOption: (pollId, optionId) =>
    apiFetch(`/api/admin/polls/${pollId}/options/${optionId}`, { method: "DELETE" }),
  setPollOptionCorrect: (pollId, optionId, isCorrect) =>
    apiFetch(`/api/admin/polls/${pollId}/options/${optionId}`, { method: "PATCH", body: JSON.stringify({ isCorrect }) }),
  closePoll: (pollId) => apiFetch(`/api/admin/polls/${pollId}/close`, { method: "POST" }),
  revealPoll: (pollId) => apiFetch(`/api/admin/polls/${pollId}/reveal`, { method: "POST" }),
  resetPoll: (pollId) => apiFetch(`/api/admin/polls/${pollId}/reset`, { method: "POST" }),
  pollResults: (pollId) => apiFetch(`/api/admin/polls/${pollId}/results`),

  activePoll: (channel) => apiFetch(`/api/rooms/${channel}/polls/active`),
  votePoll: (channel, pollId, optionId) =>
    apiFetch(`/api/rooms/${channel}/polls/${pollId}/vote`, { method: "POST", body: JSON.stringify({ optionId }) }),

  // --- LiveKit (Phase 6, alongside HLS) ---
  livekitStatus: () => apiFetch("/api/livekit/status"),
  livekitToken: (channel) => apiFetch(`/api/livekit/token?channel=${encodeURIComponent(channel)}`),
  livekitMonitorToken: (token) => apiFetch(`/api/livekit/monitor-token/${encodeURIComponent(token)}`),
  createIngress: (channel) => apiFetch(`/api/livekit/channels/${channel}/ingress`, { method: "POST" }),
  deleteIngress: (channel) => apiFetch(`/api/livekit/channels/${channel}/ingress`, { method: "DELETE" }),
};

export function hlsUrl(username) {
  return `${MEDIA_URL}/live/${username}/index.m3u8`;
}
