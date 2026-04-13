"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { apiPost, apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMsg { role: "user" | "assistant"; content: string; }

interface SupportTicket {
  id: string;
  type: string;
  subject: string;
  status: "open" | "in_review" | "resolved" | "closed";
  created_at: string;
  admin_notes?: string;
}

// ─── Quick-help topics ────────────────────────────────────────────────────────

const QUICK_TOPICS = [
  { label: "Deposit not credited",   msg: "My M-Pesa deposit went through but USDT hasn't been credited." },
  { label: "Withdrawal delayed",     msg: "I initiated a withdrawal but haven't received funds yet." },
  { label: "OTP not arriving",       msg: "I'm not receiving the OTP SMS or email." },
  { label: "KYC submission",         msg: "How do I complete KYC verification?" },
  { label: "P2P trade help",         msg: "I need help with a P2P trade I'm stuck on." },
  { label: "Reset asset PIN",        msg: "I forgot my asset PIN. How do I reset it?" },
];

const STATUS_STYLES: Record<SupportTicket["status"], string> = {
  open:      "bg-gold/10 text-gold",
  in_review: "bg-primary/10 text-primary",
  resolved:  "bg-up/10 text-up",
  closed:    "bg-border text-text-muted",
};

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#00E5B4" strokeWidth="1.75"/>
            <path d="M9 9h.01M15 9h.01M9.5 14s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5"
              stroke="#00E5B4" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </div>
      )}
      <div className={cn(
        "max-w-[78%] px-3.5 py-2.5 rounded-2xl font-outfit text-sm leading-relaxed",
        isUser
          ? "bg-primary/20 text-text-primary rounded-br-none"
          : "bg-bg-surface border border-border text-text-secondary rounded-bl-none"
      )}>
        {msg.content}
      </div>
    </div>
  );
}

// ─── Raise Ticket Sheet ───────────────────────────────────────────────────────

function RaiseTicketSheet({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<"deposit"|"withdrawal"|"trade"|"other">("deposit");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [briefing, setBriefing] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function aiSuggest() {
    if (!briefing.trim()) return;
    setSuggesting(true);
    try {
      const res = await apiPost<{ data: { suggestion: string } }>("/support/ai-suggest", {
        type, brief: briefing,
      });
      setDescription(res.data.suggestion);
    } catch {
      setDescription(briefing);
    } finally {
      setSuggesting(false);
    }
  }

  async function submit() {
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await apiPost("/support/tickets", { type, subject, description });
      setDone(true);
    } catch {
      // keep form open
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return (
    <BottomSheet isOpen onClose={onClose} title="Ticket Submitted" showCloseButton>
      <div className="px-4 pb-10 flex flex-col items-center text-center gap-4 pt-4">
        <div className="w-16 h-16 rounded-full bg-up/10 border border-up/30 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#00E5B4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3 className="font-syne font-bold text-lg text-text-primary">Ticket submitted</h3>
        <p className="font-outfit text-sm text-text-muted max-w-xs">
          Our team will review it and reply within 24 hours. Track status in &quot;My Tickets&quot;.
        </p>
        <button onClick={onClose} className="btn-primary max-w-xs w-full">Done</button>
      </div>
    </BottomSheet>
  );

  return (
    <BottomSheet isOpen onClose={onClose} title="Raise a Ticket" showCloseButton>
      <div className="px-4 pb-8 space-y-4">
        <div>
          <p className="font-outfit text-xs text-text-secondary mb-2">Issue type</p>
          <div className="grid grid-cols-2 gap-2">
            {(["deposit","withdrawal","trade","other"] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={cn(
                  "py-2 rounded-xl border font-outfit text-xs font-semibold capitalize transition-all",
                  type === t ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-text-muted"
                )}>
                {t === "trade" ? "Trading" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Subject</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
            maxLength={200} placeholder="e.g. M-Pesa deposit not received"
            className="input-field" />
        </div>

        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">
            Brief description <span className="text-text-muted">(AI will expand it)</span>
          </label>
          <div className="flex gap-2">
            <input type="text" value={briefing} onChange={(e) => setBriefing(e.target.value)}
              maxLength={200} placeholder="e.g. Sent KSh 5000, no USDT after 20 mins"
              className="input-field flex-1" />
            <button onClick={aiSuggest} disabled={!briefing.trim() || suggesting}
              className="px-3 py-2 rounded-xl bg-primary/15 border border-primary/30 font-outfit text-xs text-primary font-semibold disabled:opacity-40 flex-shrink-0">
              {suggesting ? "…" : "✨ AI"}
            </button>
          </div>
        </div>

        <div>
          <label className="block font-outfit text-xs text-text-secondary mb-1.5">Full description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            rows={4} maxLength={2000}
            placeholder="Describe the issue in detail…"
            className="w-full bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 font-outfit text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 resize-none" />
        </div>

        <button onClick={submit}
          disabled={!subject.trim() || !description.trim() || submitting}
          className="btn-primary disabled:opacity-40">
          {submitting ? "Submitting…" : "Submit Ticket"}
        </button>
      </div>
    </BottomSheet>
  );
}

// ─── Main Support Page ────────────────────────────────────────────────────────

export default function SupportPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([{
    role: "assistant",
    content: "Hi! I'm the KryptoKe Support AI. Ask me anything about deposits, withdrawals, trading, or account issues — I'll help instantly.",
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"chat" | "tickets">("chat");
  const [ticketSheetOpen, setTicketSheetOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: ticketsData, refetch: refetchTickets } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => apiGet<{ data: SupportTicket[] }>("/support/tickets"),
    staleTime: 30_000,
    enabled: tab === "tickets",
  });
  const tickets = ticketsData?.data ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    const history = messages.slice(-10);
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setLoading(true);
    try {
      const res = await apiPost<{ data: { reply: string } }>("/support/chat", {
        message: msg,
        history: history.map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "Something went wrong. Please try again or raise a support ticket.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen flex flex-col">
      <TopBar title="Support" showBack />

      {/* Tabs */}
      <div className="flex mx-4 mt-3 gap-0 bg-bg-surface2 rounded-xl p-1 flex-shrink-0">
        {(["chat", "tickets"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t === "tickets") refetchTickets(); }}
            className={cn(
              "flex-1 py-2 rounded-lg font-outfit text-xs font-semibold transition-all",
              tab === t ? "bg-primary/20 text-primary" : "text-text-muted"
            )}>
            {t === "chat" ? "AI Chat" : "My Tickets"}
          </button>
        ))}
      </div>

      {/* ════ CHAT TAB ════ */}
      {tab === "chat" && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mr-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#00E5B4" strokeWidth="1.75"/>
                  </svg>
                </div>
                <div className="bg-bg-surface border border-border rounded-2xl rounded-bl-none px-4 py-2.5 flex gap-1 items-center">
                  {[0,1,2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex-shrink-0">
              <p className="font-outfit text-[10px] text-text-muted uppercase tracking-wide mb-2">Common Issues</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TOPICS.map(({ label, msg }) => (
                  <button key={label} onClick={() => sendMessage(msg)}
                    className="font-outfit text-[11px] text-text-secondary bg-bg-surface border border-border rounded-full px-3 py-1.5 active:bg-bg-surface2 transition-colors">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-shrink-0 border-t border-border px-4 py-3 flex gap-2 items-end">
            <textarea value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
              rows={1} placeholder="Ask anything…" maxLength={1000}
              className="flex-1 bg-bg-surface2 border border-border rounded-xl px-3 py-2 font-outfit text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50 resize-none min-h-[40px] max-h-[100px]"
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="#080C14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="flex-shrink-0 px-4 pb-3 pb-safe">
            <button onClick={() => setTicketSheetOpen(true)}
              className="w-full py-2.5 rounded-xl border border-border font-outfit text-xs text-text-muted">
              Still need help? Raise a support ticket →
            </button>
          </div>
        </>
      )}

      {/* ════ TICKETS TAB ════ */}
      {tab === "tickets" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 pt-4 pb-2">
            <button onClick={() => setTicketSheetOpen(true)}
              className="w-full py-3 rounded-xl bg-primary/15 border border-primary/30 font-syne font-bold text-sm text-primary flex items-center justify-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              New Ticket
            </button>
          </div>
          {tickets.length === 0 ? (
            <div className="py-16 text-center px-4">
              <p className="font-outfit text-sm text-text-muted">No tickets yet</p>
              <p className="font-outfit text-xs text-text-muted mt-1 opacity-60">
                Use AI chat for instant help, or raise a ticket for complex issues
              </p>
            </div>
          ) : (
            <div className="px-4 space-y-2 pb-8">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="card">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="font-outfit text-sm font-semibold text-text-primary truncate">{ticket.subject}</p>
                      <p className="font-outfit text-[10px] text-text-muted mt-0.5">
                        {ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)} ·{" "}
                        {new Date(ticket.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <span className={cn("font-outfit text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                      STATUS_STYLES[ticket.status])}>
                      {ticket.status === "in_review" ? "In review"
                        : ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
                    </span>
                  </div>
                  {ticket.admin_notes && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
                      <p className="font-outfit text-[10px] text-primary font-semibold mb-0.5">Staff response</p>
                      <p className="font-outfit text-xs text-text-secondary leading-relaxed">{ticket.admin_notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ticketSheetOpen && (
        <RaiseTicketSheet onClose={() => {
          setTicketSheetOpen(false);
          if (tab === "tickets") refetchTickets();
        }} />
      )}
    </div>
  );
}
