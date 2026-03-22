"use client";

import { useState } from "react";
import { IconBell, IconMenu } from "@/components/icons";
import { useNotifications, useAuth } from "@/lib/store";
import { QuickProfileSheet } from "@/components/home/QuickProfileSheet";

interface HomeTopBarProps {
  onBellClick: () => void;
  onMenuClick: () => void;
}

export function HomeTopBar({ onBellClick, onMenuClick }: HomeTopBarProps) {
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "KK";

  return (
    <>
      <div className="top-bar">
        {/* Avatar tap → opens quick profile sheet */}
        <button onClick={() => setProfileOpen(true)} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {user?.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              : <span className="font-syne font-bold text-xs text-primary">{initials}</span>}
          </div>
          <span className="font-syne font-bold text-base text-gradient leading-none">KryptoKe</span>
        </button>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onBellClick}
            className="tap-target relative text-text-muted hover:text-text-secondary transition-colors"
            aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`}
          >
            <IconBell size={22} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-[7px] h-[7px] rounded-full bg-down" />
            )}
          </button>
          <button
            onClick={onMenuClick}
            className="tap-target text-text-muted hover:text-text-secondary transition-colors"
            aria-label="Menu"
          >
            <IconMenu size={22} />
          </button>
        </div>
      </div>

      <QuickProfileSheet isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
