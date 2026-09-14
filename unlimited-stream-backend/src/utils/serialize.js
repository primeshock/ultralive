// Served by our own Express app (helmet -> X-Content-Type-Options: nosniff, and we
// force Content-Type: image/jpeg ourselves) rather than node-media-server's bare
// static folder, which has neither. See routes/media.routes.js.
function apiBase({ serverIp, apiPort }) {
  return `http://${serverIp}:${apiPort}`;
}

function thumbnailUrl(user, ctx) {
  if (!user.thumbnailVersion) return null;
  return `${apiBase(ctx)}/thumbnails/${user.username}.jpg?v=${user.thumbnailVersion}`;
}

function publicUser(user, ctx) {
  return {
    username: user.username,
    displayName: user.displayName,
    streamTitle: user.streamTitle,
    donateUrl: user.donateUrl,
    isLive: user.isLive,
    chatEnabled: user.chatEnabled,
    chatMode: user.chatMode,
    showViewerCount: user.showViewerCount,
    thumbnailUrl: thumbnailUrl(user, ctx),
  };
}

function ownerUser(user, ctx) {
  const { serverIp, rtmpPort } = ctx;
  return {
    ...publicUser(user, ctx),
    role: user.role,
    email: user.email,
    streamKey: user.streamKey,
    autoChatMessage: user.autoChatMessage,
    mutedUsers: user.mutedUsers,
    rtmpServer: `rtmp://${serverIp}:${rtmpPort}/live`,
    streamKeyField: `${user.username}?key=${user.streamKey}`,
  };
}

module.exports = { publicUser, ownerUser };
