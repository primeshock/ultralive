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

  siteSettings: () => apiFetch("/api/site/settings"),
  studentSession: (channel) => apiFetch(`/api/session/me?channel=${encodeURIComponent(channel)}`),
  changePassword: (currentPassword, newPassword) => apiFetch("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  adminChannels: () => apiFetch("/api/admin/channels"),
  adminChannel: (channel) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}`),
  createChannel: (payload) => apiFetch("/api/admin/channels", { method: "POST", body: JSON.stringify(payload) }),
  updateChannel: (channel, payload) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  regenerateChannelKey: (channel) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/regenerate-key`, { method: "POST" }),
  activeStudents: (channel) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/active-students`),
  attendance: (channel) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/attendance`),
  moderation: (channel) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/moderation`),
  moderate: (channel, payload) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/moderation`, { method: "POST", body: JSON.stringify(payload) }),
  deleteModeration: (id) => apiFetch(`/api/admin/moderation/${encodeURIComponent(id)}`, { method: "DELETE" }),
  chatMode: (channel, chatMode) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/chat-mode`, { method: "POST", body: JSON.stringify({ chatMode }) }),
  testLink: (channel, displayName) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/test-link`, { method: "POST", body: JSON.stringify({ displayName }) }),
  monitorLink: (channel) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/monitor-link`, { method: "POST" }),
  disableMonitorLink: (channel) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/monitor-link`, { method: "DELETE" }),
  polls: (channel) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/polls`),
  createPoll: (channel, payload) => apiFetch(`/api/admin/channels/${encodeURIComponent(channel)}/polls`, { method: "POST", body: JSON.stringify(payload) }),
  closePoll: (id) => apiFetch(`/api/admin/polls/${encodeURIComponent(id)}/close`, { method: "POST" }),
  revealPoll: (id) => apiFetch(`/api/admin/polls/${encodeURIComponent(id)}/reveal`, { method: "POST" }),
  resetPoll: (id) => apiFetch(`/api/admin/polls/${encodeURIComponent(id)}/reset`, { method: "POST" }),
  pollResults: (id) => apiFetch(`/api/admin/polls/${encodeURIComponent(id)}/results`),
  activePoll: (channel) => apiFetch(`/api/rooms/${encodeURIComponent(channel)}/polls/active`),
  votePoll: (channel, pollId, optionId) => apiFetch(`/api/rooms/${encodeURIComponent(channel)}/polls/${encodeURIComponent(pollId)}/vote`, { method: "POST", body: JSON.stringify({ optionId }) }),
  ownerAdmins: () => apiFetch("/api/master/admins"),
  createAdmin: (username, password) => apiFetch("/api/master/admins", { method: "POST", body: JSON.stringify({ username, password }) }),
  deleteAdmin: (id) => apiFetch(`/api/master/admins/${encodeURIComponent(id)}`, { method: "DELETE" }),
  ownerChannels: () => apiFetch("/api/master/channels"),
  ownerSettings: () => apiFetch("/api/master/settings"),
  updateOwnerSettings: (payload) => apiFetch("/api/master/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  systemStats: () => apiFetch("/api/master/system-stats"),
  activity: () => apiFetch("/api/master/activity"),
  livekitToken: (channel) => apiFetch(`/api/livekit/token?channel=${encodeURIComponent(channel)}`),
  livekitIngress: (channel) => apiFetch(`/api/livekit/channels/${encodeURIComponent(channel)}/ingress`, { method: "POST" }),
  deleteLivekitIngress: (channel) => apiFetch(`/api/livekit/channels/${encodeURIComponent(channel)}/ingress`, { method: "DELETE" }),
};

export function hlsUrl(username) {
  return `${MEDIA_URL}/live/${username}/index.m3u8`;
}
