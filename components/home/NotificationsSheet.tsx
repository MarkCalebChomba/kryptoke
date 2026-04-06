"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useNotifications as useNotificationsStore } from "@/lib/store";
import { useNotifications, useMarkAllRead } from "@/lib/hooks/useNotifications";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { Notification, NotificationType } from "@/types";

const TYPE_ICONS: Record<NotificationType, string> = {
  deposit_confirmed: "💰",
  withdrawal_sent:   "📤",
  price_alert:       "🔔",
  new_listing:       "✨",
  security_alert:    "🛡️",
  earn_interest:     "💹",
  order_filled:      "✅",
  announcement:      "📢",
  kyc_update:        "🪪",
};

const TYPE_COLORS: Record<NotificationType, string> = {
  deposit_confirmed: "text-up bg-up/10",
  withdrawal_sent:   "text-primary bg-primary/10",
  price_alert:       "text-gold bg-gold/10",
  new_listing:       "text-primary bg-primary/10",
  security_alert:    "text-down bg-down/10",
  earn_interest:     "text-up bg-up/10",
  order_filled:      "text-primary bg-primary/10",
  announcement:      "text-gold bg-gold/10",
  kyc_update:        "text-text-secondary bg-bg-surface2",
};

// Build the deep-link route for a notification, including reference_id as query param
function getNotifRoute(notification: Notification): string {
  const data = (notification.data ?? {}) as Record<string, string>;
  const refId = data.txId || data.depositId || data.withdrawalId || data.orderId || data.referenceId || "";

  switch (notification.type) {
    case "deposit_confirmed":
      return refId ? `/me?highlight=${refId}` : "/me";
    case "withdrawal_sent":
      return refId ? `/me?highlight=${refId}` : "/me";
    case "earn_interest":
      return refId ? `/me?highlight=${refId}` : "/earn";
    case "order_filled":
      return refId ? `/me?highlight=${refId}` : "/trade";
    case "price_alert":
      return data.symbol ? `/markets/${data.symbol}` : "/markets";
    case "new_listing":
      return data.symbol ? `/markets/${data.symbol}` : "/markets";
    case "security_alert":
      return "/security";
    case "kyc_update":
      return "/kyc";
    case "announcement":
      return "/";
    default:
      return "/";
  }
}

function NotifRow({ notification, onClick }: { notification: Notification; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 px-4 py-3 w-full active:bg-bg-surface2 transition-colors relative"
    >
      {!notification.read && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
      )}
      <div className={cn(
        "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm",
        TYPE_COLORS[notification.type]
      )}>
        {TYPE_ICONS[notification.type]}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={cn(
          "font-outfit text-sm leading-tight",
          notification.read ? "text-text-secondary font-normal" : "text-text-primary font-medium"
        )}>
          {notification.title}
        </p>
        <p className="font-outfit text-xs text-text-muted mt-0.5 leading-relaxed line-clamp-2">
          {notification.body}
        </p>
        <p className="font-outfit text-[10px] text-text-muted mt-1">
          {formatTimeAgo(notification.createdAt)}
        </p>
      </div>
      {/* Arrow indicating it's tappable and has a deep link */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-text-muted mt-1 flex-shrink-0">
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

export function NotificationsSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { notifications, unreadCount } = useNotificationsStore();
  const { isLoading } = useNotifications();
  const markAllRead = useMarkAllRead();
  const [expanded, setExpanded] = useState(false);

  function handleNotifClick(notification: Notification) {
    onClose();
    const route = getNotifRoute(notification);
    router.push(route);
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight={expanded ? "97dvh" : "85dvh"}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div>
          <h2 className="font-syne font-bold text-base text-text-primary">Notifications</h2>
          {unreadCount > 0 && (
            <p className="font-outfit text-xs text-text-muted mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}
              className="font-outfit text-sm text-primary font-medium">
              Mark all read
            </button>
          )}
          <button onClick={() => setExpanded((e) => !e)} className="tap-target text-text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              {expanded
                ? <><path d="M8 3v3a2 2 0 0 1-2 2H3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 8h-3a2 2 0 0 1-2-2V3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 16h3a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 21v-3a2 2 0 0 1 2-2h3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
                : <><path d="M15 3h6v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 21H3v-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 3l-7 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 21l7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>}
            </svg>
          </button>
        </div>
      </div>

      <div className="overflow-y-auto divide-y divide-border/50" style={{ maxHeight: expanded ? "calc(97dvh - 80px)" : "70vh" }}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <div className="skeleton w-8 h-8 rounded-xl flex-shrink-0" />
              <div className="flex-1">
                <div className="skeleton h-3.5 w-40 mb-2" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-text-muted font-outfit text-sm">No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotifRow key={n.id} notification={n} onClick={() => handleNotifClick(n)} />
          ))
        )}
      </div>
    </BottomSheet>
  );
}
