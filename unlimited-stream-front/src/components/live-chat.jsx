"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Reply, Smile, X } from "lucide-react";
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
import { api } from "@/lib/api";

const EMOJIS = ["😀", "😂", "❤️", "👍", "👎", "🎉", "🤔", "😢", "🔥", "🙏"];

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

export function LiveChat({ channel, initialEnabled = true }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(initialEnabled);
  const [sendError, setSendError] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef(null);

  const canModerate = user && ["admin", "owner", "SUPER_OWNER", "ORGANIZATION_OWNER", "ADMIN_L1", "ADMIN_L2"].includes(user.role);

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
    function onState({ enabled }) {
      setChatEnabled(enabled);
    }
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
      socket.off("chat:error", onError);
      socket.disconnect();
    };
  }, [channel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
    try {
      await api.moderate(channel, {
        externalUserId: message.externalUserId || message.username,
        type,
        scope,
        minutes: scope === "timed" ? 10 : undefined,
        reason: `اعمال از چت توسط ${user.username}`,
      });
    } catch (err) {
      setSendError(err.message);
      setTimeout(() => setSendError(""), 3000);
    }
  }

  function findMessage(id) {
    return messages.find((m) => String(m.id) === String(id));
  }

  const canSend = connected && chatEnabled;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div><p className="text-sm font-semibold">گفت‌وگوی کلاس</p><p className="text-[11px] text-white/45">هم‌زمان با اتاق زنده</p></div>
        <span className={`size-2 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_12px_rgb(52_211_153)]" : "bg-white/25"}`} aria-label={connected ? "متصل" : "در حال اتصال"} />
      </div>
      <ScrollArea className="flex-1 min-h-0 p-4">
        <div className="flex flex-col gap-2.5">
          {messages.map((m, i) =>
            m.kind === "system" ? (
              <p key={i} className="text-sm text-muted-foreground italic wrap-break-word">
                <MessageText text={m.text} />
              </p>
            ) : (
              <div key={i} className="group flex items-start justify-between gap-1 rounded-2xl border border-white/8 bg-white/[0.055] px-3 py-2 transition-colors hover:bg-white/[0.09]">
                <div className="min-w-0">
                  {m.replyTo && findMessage(m.replyTo) && (
                    <p className="text-xs text-muted-foreground border-r-2 pr-1.5 mb-0.5 truncate">
                      پاسخ به {findMessage(m.replyTo).username}: {findMessage(m.replyTo).text}
                    </p>
                  )}
                  <p className="text-sm leading-6 wrap-break-word">
                    <span className="font-semibold text-cyan-100">{m.username}: </span>
                    <MessageText text={m.text} />
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setReplyTarget({ id: m.id, username: m.username, text: m.text })}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="پاسخ"
                  >
                    <Reply className="size-4" />
                  </button>
                  {canModerate && m.username && m.externalUserId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<button type="button" className="text-muted-foreground hover:text-foreground" aria-label="گزینه‌های پیام" />}
                      >
                        <MoreVertical className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleModeration(m, "mute", "permanent")}>سکوت</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => handleModeration(m, "ban", "permanent")}>بن</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleModeration(m, "ban", "timed")}>بن ۱۰ دقیقه</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleModeration(m, "mute", "timed")}>سکوت ۱۰ دقیقه</DropdownMenuItem>
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

      {!chatEnabled && (
        <p className="border-t border-white/10 bg-black/20 py-2 text-center text-xs text-white/50">چت توسط استریمر بسته شده</p>
      )}
      {sendError && <p className="text-xs text-center text-destructive py-1">{sendError}</p>}

      {replyTarget && (
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-t bg-muted/40 text-xs">
          <span className="truncate">
            پاسخ به <b>{replyTarget.username}</b>: {replyTarget.text}
          </span>
          <button type="button" onClick={() => setReplyTarget(null)} aria-label="لغو پاسخ">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {showEmoji && (
        <div className="flex flex-wrap gap-1 p-2 border-t">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => addEmoji(e)} className="text-lg hover:scale-110 transition-transform">
              {e}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={sendMessage} className="m-3 flex gap-2 rounded-full border border-white/12 bg-black/20 p-1.5 focus-within:border-cyan-300/45">
        <button type="button" onClick={() => setShowEmoji((s) => !s)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="ایموجی">
          <Smile className="size-5" />
        </button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="border-0 bg-transparent text-white shadow-none focus-visible:ring-0"
          placeholder={!chatEnabled ? "چت بسته است" : connected ? "پیام بنویس..." : "در حال اتصال..."}
          disabled={!canSend}
          maxLength={300}
        />
        <Button type="submit" disabled={!canSend}>
          ارسال
        </Button>
      </form>
    </div>
  );
}
