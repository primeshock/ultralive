"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pin, PinOff, Reply, Send, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth-context";
import { linkifyParts } from "@/lib/linkify";
import { useModeration } from "@/lib/use-moderation";

const EMOJIS = ["😀", "😂", "❤️", "👍", "👎", "🎉", "🤔", "😢", "🔥", "🙏"]; // taste-skill-ignore (the emoji picker is a feature)

function MessageText({ text }) {
  return linkifyParts(text).map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{part}</span>
    ) : (
      <a key={i} href={part.url} target="_blank" rel="noopener noreferrer" className="underline break-all text-primary">
        {part.url}
      </a>
    )
  );
}

export function LiveChat({ channel, initialEnabled = true, compact = false, headerExtra = null, footerSlot = null }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(initialEnabled);
  const [sendError, setSendError] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pinned, setPinned] = useState(null);
  const bottomRef = useRef(null);
  const rootRef = useRef(null);

  const canModerate = user && ["admin", "owner", "SUPER_OWNER", "ORGANIZATION_OWNER", "ADMIN_L1", "ADMIN_L2"].includes(user.role);

  const moderation = useModeration(channel, "channel", Boolean(canModerate));

  // NOTE: this used to bail out entirely when `user` was falsy, which meant a
  // student (no real logged-in account, only a room-session cookie) could
  // never connect to chat at all. The backend accepts either identity — just
  // always try to connect and let the server say no if neither a real login
  // nor a valid class session cookie is present.
  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    function onConnect() {
      setConnected(true);
      socket.emit("chat:join", channel);
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onHistory(history) {
      setMessages(history);
    }
    function onMessage(msg) {
      setMessages((prev) => [...prev.slice(-199), { ...msg, kind: "user" }]);
    }
    function onSystem(msg) {
      setMessages((prev) => [...prev.slice(-199), { ...msg, kind: "system" }]);
    }
    function onState({ enabled, pinned: p }) {
      setChatEnabled(enabled);
      if (p !== undefined) setPinned(p);
    }
    function onPinned(p) { setPinned(p); }
    function onClear() { setMessages([]); setReplyTarget(null); }
    function onError({ message }) {
      setSendError(message);
      setTimeout(() => setSendError(""), 3000);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:history", onHistory);
    socket.on("chat:message", onMessage);
    socket.on("chat:system", onSystem);
    socket.on("chat:state", onState);
    socket.on("chat:clear", onClear);
    socket.on("chat:pinned", onPinned);
    socket.on("chat:error", onError);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:history", onHistory);
      socket.off("chat:message", onMessage);
      socket.off("chat:system", onSystem);
    socket.off("chat:state", onState);
    socket.off("chat:clear", onClear);
    socket.off("chat:pinned", onPinned);
      socket.off("chat:error", onError);
      socket.disconnect();
    };
  }, [channel]);

  useEffect(() => {
    // scrollIntoView() would also scroll the whole page (the cause of "page jumps to the bottom on load");
    // only the chat's own scroll area may move.
    let node = bottomRef.current?.parentElement;
    while (node && node !== rootRef.current) {
      if (node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) { node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); break; }
      node = node.parentElement;
    }
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    getSocket().emit("chat:message", { channel, text: trimmed, replyTo: replyTarget?.id || null });
    setText("");
    setReplyTarget(null);
  }

  function addEmoji(emoji) {
    setText((t) => t + emoji);
    setShowEmoji(false);
  }

  async function handleModeration(message, type, scope) {
    await moderation.change({ externalUserId: message.externalUserId }, type, scope);
  }

  function findMessage(id) {
    return messages.find((m) => String(m.id) === String(id));
  }

  const canSend = connected && (chatEnabled || Boolean(canModerate));
  const pin = (id) => getSocket().emit("chat:pin", { channel, id });

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col overflow-hidden text-white">
      <div className={`flex items-center justify-between border-b border-[var(--line)] ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
        <div><p className={`${compact ? "text-[13px] font-medium text-[var(--ink)]" : "text-sm font-semibold"}`}>گفت‌وگوی کلاس</p>{!compact && <p className="text-[11px] text-[var(--ink-3)]">هم‌زمان با اتاق زنده</p>}</div>
        <span className="flex items-center gap-2"><span className={`size-2 rounded-full ${connected ? "bg-emerald-400" : "bg-[var(--s3)]"}`} aria-label={connected ? "متصل" : "در حال اتصال"} />{headerExtra}</span>
      </div>
      {pinned && (
        <div className="flex items-start gap-2 border-b border-[var(--line)] bg-[var(--accent-soft)] px-3 py-1.5">
          <Pin className="mt-1 size-3.5 shrink-0 text-[var(--accent-ink)]" />
          <p className="min-w-0 flex-1 text-[12px] leading-5 text-[var(--ink)] wrap-break-word"><span className="font-medium text-[var(--accent-ink)]">{pinned.username}: </span><MessageText text={pinned.text} /></p>
          {canModerate && <button type="button" onClick={() => pin(null)} aria-label="برداشتن پین" className="text-[var(--ink-3)] hover:text-[var(--ink)]"><PinOff className="size-3.5" /></button>}
        </div>
      )}
      <ScrollArea className={`flex-1 min-h-0 ${compact ? "p-2" : "p-4"}`}>
        <div className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
          {messages.map((m, i) =>
            m.kind === "system" ? (
              <p key={i} className="px-2 py-1 text-center text-[12px] text-[var(--ink-3)] wrap-break-word">
                <MessageText text={m.text} />
              </p>
            ) : (
              <div key={i} className={`group flex items-start justify-between gap-2 rounded-lg bg-[color-mix(in_oklab,var(--s2)_55%,transparent)] transition-colors hover:bg-[var(--s2)] ${compact ? "px-2.5 py-1" : "px-3 py-1.5"}`}>
                <div className="min-w-0">
                  {m.replyTo && findMessage(m.replyTo) && (
                    <p className="mb-0.5 truncate border-r-2 border-[var(--accent)] pr-1.5 text-[12px] text-[var(--ink-3)]">
                      پاسخ به {findMessage(m.replyTo).username}: {findMessage(m.replyTo).text}
                    </p>
                  )}
                  <p className={`wrap-break-word text-[var(--ink)] ${compact ? "text-[13px] leading-6" : "text-sm leading-6"}`}>
                    <span className={`${compact ? "text-[12px]" : "text-[13px]"} font-medium ${m.externalUserId ? "text-[var(--ink-2)]" : "text-[var(--accent-ink)]"}`}>{m.username}<span className="text-[var(--ink-3)]">: </span></span>
                    <MessageText text={m.text} />
                    {m.private && <span className="ms-1.5 rounded bg-[var(--accent-soft)] px-1 text-[11px] text-[var(--accent-ink)]">خصوصی</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setReplyTarget({ id: m.id, username: m.username, text: m.text })}
                    className="text-[var(--ink-3)] hover:text-[var(--ink)]"
                    aria-label="پاسخ"
                  >
                    <Reply className="size-4" />
                  </button>
                  {canModerate && m.id && (
                    <button type="button" onClick={() => pin(m.id)} className="text-[var(--ink-3)] hover:text-[var(--ink)]" aria-label="پین کردن">
                      <Pin className="size-4" />
                    </button>
                  )}
                  {canModerate && m.username && m.externalUserId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<button type="button" className="text-[var(--ink-3)] hover:text-[var(--ink)]" aria-label="گزینه‌های پیام" />}
                      >
                        <MoreVertical className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="room-float min-w-32 space-y-1 rounded-2xl p-1.5 text-center supports-[backdrop-filter]:bg-[var(--s2)]">
                        {["mute", "ban"].map((type) => {
                          const active = moderation.restrictionFor(m.externalUserId, type);
                          const label = type === "ban" ? "بن" : "سکوت";
                          return <div key={type} className="rounded-lg border border-[var(--line)] bg-[var(--s1)] p-0.5">
                            <DropdownMenuItem disabled={moderation.busy || !moderation.ready} className="justify-center text-xs text-white" onClick={() => handleModeration(m, type, "permanent")}>
                              {active ? (type === "ban" ? "رفع بن (Unban)" : "رفع سکوت (Unmute)") : label}
                            </DropdownMenuItem>
                            {!active && <DropdownMenuItem disabled={moderation.busy || !moderation.ready} className="justify-center text-xs text-white" onClick={() => handleModeration(m, type, "timed")}>{label} ۱۰ دقیقه</DropdownMenuItem>}
                          </div>;
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {moderation.error && <p role="alert" className="text-xs text-center text-destructive py-1">{moderation.error}</p>}
      {sendError && <p className="text-xs text-center text-destructive py-1">{sendError}</p>}

      {replyTarget && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--s2)] px-3 py-1.5 text-[12px] text-[var(--ink-2)]">
          <span className="truncate">
            پاسخ به <b>{replyTarget.username}</b>: {replyTarget.text}
          </span>
          <button type="button" onClick={() => setReplyTarget(null)} aria-label="لغو پاسخ">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {showEmoji && (
        <div className="flex flex-wrap gap-1 border-t border-[var(--line)] p-2">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => addEmoji(e)} className="text-lg hover:scale-110 transition-transform">
              {e}
            </button>
          ))}
        </div>
      )}

      {footerSlot}

      <form onSubmit={sendMessage} className="mx-3 mb-3 mt-2 flex shrink-0 items-center gap-1 rounded-full border border-[var(--line-strong)] bg-[var(--s2)] p-1 transition-colors focus-within:border-[var(--accent)]">
        <button type="button" onClick={() => setShowEmoji((s) => !s)} className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--s3)] hover:text-[var(--ink)]" aria-label="ایموجی">
          <Smile className="size-[18px]" />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-white outline-none placeholder:text-[var(--ink-3)] disabled:cursor-not-allowed"
          placeholder={!chatEnabled ? (canModerate ? "چت برای دانش‌آموزان بسته است" : "چت بسته است") : connected ? "پیام بنویس..." : "در حال اتصال..."}
          disabled={!canSend}
          maxLength={300}
        />
        <button type="submit" disabled={!canSend || !text.trim()} aria-label="ارسال" className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white shadow-[0_4px_12px_-4px_rgb(10_123_196/.7)] transition hover:bg-[var(--accent-hover)] disabled:bg-[var(--s3)] disabled:text-[var(--ink-3)] disabled:shadow-none">
          <Send className="size-4 -scale-x-100" />
        </button>
      </form>
    </div>
  );
}
