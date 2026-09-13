"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
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

function MessageText({ text }) {
  return linkifyParts(text).map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{part}</span>
    ) : (
      <a
        key={i}
        href={part.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all text-primary"
      >
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
  const [identity, setIdentity] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const bottomRef = useRef(null);

  const canModerate = user && ["admin", "owner"].includes(user.role);
  const isStreamer = user && user.username === channel;

  useEffect(() => {
    let cancelled = false;
    async function connectChat() {
      let currentIdentity = user ? { username: user.username, role: user.role } : null;
      if (!currentIdentity) {
        try {
          const student = await api.studentSession(channel);
          currentIdentity = { username: student.displayName, role: "student", externalUserId: student.externalUserId };
        } catch {
          if (!cancelled) setIdentity(null);
          return;
        }
      }
      if (cancelled) return;
      setIdentity(currentIdentity);

      const socket = getSocket();
      socket.connect();

      function onConnect() {
        setConnected(true);
        socket.emit("chat:join", channel);
      }
      function onDisconnect() { setConnected(false); }
      function onHistory(history) { setMessages(history); }
      function onMessage(msg) { setMessages((prev) => [...prev.slice(-199), { ...msg, kind: "user" }]); }
      function onSystem(msg) { setMessages((prev) => [...prev.slice(-199), { ...msg, kind: "system" }]); }
      function onState({ enabled }) { setChatEnabled(enabled); }
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
      socket.on("chat:error", onError);
      if (socket.connected) onConnect();

      return () => {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("chat:history", onHistory);
        socket.off("chat:message", onMessage);
        socket.off("chat:system", onSystem);
        socket.off("chat:state", onState);
        socket.off("chat:error", onError);
        socket.disconnect();
      };
    }
    let cleanup;
    connectChat().then((fn) => { cleanup = fn; });
    return () => { cancelled = true; cleanup?.(); };
  }, [channel, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    getSocket().emit("chat:message", { channel, text: trimmed, replyTo: replyTo?.id || null });
    setText("");
    setReplyTo(null);
  }

  async function handleMute(message) {
    try {
      if (message.senderType === "student") {
        await api.moderate(channel, { externalUserId: message.senderKey, type: "mute", scope: "timed", minutes: 30, reason: "moderation from chat" });
      } else {
        await api.muteUser(message.username);
      }
    } catch (err) {
      setSendError(err.message);
      setTimeout(() => setSendError(""), 3000);
    }
  }

  const canSend = Boolean(identity) && connected && chatEnabled;

  return (
    <div className="flex flex-col h-full min-h-0 border rounded-lg overflow-hidden">
      <ScrollArea className="flex-1 min-h-0 p-3">
        <div className="flex flex-col gap-2">
          {messages.map((m, i) =>
            m.kind === "system" ? (
              <p key={i} className="text-sm text-muted-foreground italic wrap-break-word">
                <MessageText text={m.text} />
              </p>
            ) : (
              <div key={i} className="group flex items-start justify-between gap-1">
                <div className="min-w-0">
                  {m.replyTo && <div className="text-[11px] text-muted-foreground border-s-2 ps-2 mb-1">پاسخ به پیام قبلی</div>}
                  <p className="text-sm wrap-break-word"><span className="font-semibold">{m.username}: </span><MessageText text={m.text} /></p>
                </div>
                <button type="button" className="shrink-0 text-xs opacity-0 group-hover:opacity-100 text-muted-foreground" onClick={() => setReplyTo(m)}>↩</button>
                {(canModerate || isStreamer) && m.username && m.username !== user?.username && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                          aria-label="گزینه‌های پیام"
                        />
                      }
                    >
                      <MoreVertical className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" onClick={() => handleMute(m)}>
                        میوت {m.username}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {!chatEnabled && (
        <p className="text-xs text-center text-muted-foreground py-1 border-t bg-muted/50">
          چت توسط استریمر بسته شده
        </p>
      )}
      {sendError && <p className="text-xs text-center text-destructive py-1">{sendError}</p>}

      {replyTo && <div className="px-3 py-2 text-xs border-t bg-muted/50 flex items-center justify-between"><span>پاسخ به {replyTo.username}</span><button type="button" onClick={() => setReplyTo(null)}>×</button></div>}
      <div className="flex gap-1 px-2 pt-2">{["👍","❤️","😂","👏","🔥","🙏"].map(e=><button key={e} type="button" className="text-lg" onClick={()=>setText((v)=>v+e)}>{e}</button>)}</div>
      <form onSubmit={sendMessage} className="flex gap-2 p-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            !identity ? "برای چت باید از طریق لینک کلاس وارد شوید" : !chatEnabled ? "چت بسته است" : connected ? "پیام بنویس..." : "در حال اتصال..."
          }
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
