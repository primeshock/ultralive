export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050";
export const MEDIA_URL = process.env.NEXT_PUBLIC_MEDIA_URL || "http://localhost:8000";
export const RTMP_URL = process.env.NEXT_PUBLIC_RTMP_URL || "rtmp://localhost:1935/live";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "درخواست با خطا مواجه شد");
  }
  return data;
}

async function apiUpload(path, formData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "آپلود با خطا مواجه شد");
  }
  return data;
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
  liveStreams: () => apiFetch("/api/streams/live"),
  channel: (username) => apiFetch(`/api/streams/${username}`),

  // --- Master panel (owner) ---
  createAdmin: (username, password) =>
    apiFetch("/api/master/admins", { method: "POST", body: JSON.stringify({ username, password }) }),
  listAdmins: () => apiFetch("/api/master/admins"),
  createChannel: (payload) => apiFetch("/api/master/channels", { method: "POST", body: JSON.stringify(payload) }),
  listAllChannels: () => apiFetch("/api/master/channels"),
  getSettings: () => apiFetch("/api/master/settings"),
  updateSettings: (payload) => apiFetch("/api/master/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  systemStats: () => apiFetch("/api/master/system-stats"),
  activityLog: () => apiFetch("/api/master/activity"),

  // --- Admin panel (admin + owner) ---
  myManagedChannels: () => apiFetch("/api/admin/channels"),
  setChatMode: (channel, chatMode) =>
    apiFetch(`/api/admin/channels/${channel}/chat-mode`, { method: "POST", body: JSON.stringify({ chatMode }) }),
  createTestLink: (channel, displayName) =>
    apiFetch(`/api/admin/channels/${channel}/test-link`, { method: "POST", body: JSON.stringify({ displayName }) }),
  activeStudents: (channel) => apiFetch(`/api/admin/channels/${channel}/active-students`),
  attendance: (channel) => apiFetch(`/api/admin/channels/${channel}/attendance`),
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
  createIngress: (channel) => apiFetch(`/api/livekit/channels/${channel}/ingress`, { method: "POST" }),
  deleteIngress: (channel) => apiFetch(`/api/livekit/channels/${channel}/ingress`, { method: "DELETE" }),
};

export function hlsUrl(username) {
  return `${MEDIA_URL}/live/${username}/index.m3u8`;
}
