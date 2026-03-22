"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/shared/TopBar";
import { useAuth } from "@/lib/store";
import { useToastActions } from "@/components/shared/ToastContainer";
import { apiPatch } from "@/lib/api/client";
import { getUserInitials } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

export default function ProfileEditPage() {
  const router    = useRouter();
  const toast     = useToastActions();
  const qc        = useQueryClient();
  const { user }  = useAuth();
  const fileRef   = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);

  const initials = getUserInitials(user?.displayName, user?.email);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates: Record<string, string> = {};
      if (displayName.trim() && displayName !== user?.displayName) {
        updates.displayName = displayName.trim();
      }
      if (avatarFile) {
        // Convert to base64 for upload
        const base64 = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res((reader.result as string).split(",")[1] ?? "");
          reader.onerror = rej;
          reader.readAsDataURL(avatarFile);
        });
        updates.avatarBase64 = base64;
        updates.avatarMimeType = avatarFile.type;
      }
      if (Object.keys(updates).length === 0) return;
      return apiPatch("/auth/me", updates);
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      router.back();
    },
    onError: (err) => toast.error("Update failed", err instanceof Error ? err.message : ""),
  });

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image too large", "Maximum 2MB"); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  const hasChanges = displayName.trim() !== (user?.displayName ?? "") || !!avatarFile;

  return (
    <div className="screen">
      <TopBar title="Edit Profile" showBack />

      <div className="px-4 pt-6 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <button onClick={() => fileRef.current?.click()}
            className="relative w-24 h-24 rounded-full">
            <div className="w-full h-full rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center overflow-hidden">
              {avatarPreview || user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview ?? user?.avatarUrl ?? ""} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="font-syne font-bold text-3xl text-primary">{initials}</span>
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center border-2 border-bg">
              <span className="text-bg text-xs">📷</span>
            </div>
          </button>
          <p className="font-outfit text-xs text-text-muted">Tap to change photo · JPG or PNG · Max 2MB</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleAvatarSelect} />
        </div>

        {/* Display name */}
        <div>
          <label className="block font-outfit text-xs font-semibold text-text-secondary mb-1.5">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value.slice(0, 32))}
            className="input-field"
            placeholder={user?.email?.split("@")[0] ?? "Your name"}
            autoCapitalize="words"
          />
          <p className="font-outfit text-[10px] text-text-muted mt-1">
            Shown on P2P listings, Square posts, and referrals. {32 - displayName.length} chars remaining.
          </p>
        </div>

        {/* Read-only fields */}
        <div className="space-y-3">
          <div>
            <label className="block font-outfit text-xs font-semibold text-text-secondary mb-1.5">Email</label>
            <div className="input-field text-text-muted flex items-center justify-between">
              <span className="font-outfit text-sm">{user?.email}</span>
              <span className="font-outfit text-[10px] text-text-muted bg-bg-surface2 px-2 py-0.5 rounded">Locked</span>
            </div>
          </div>

          <div>
            <label className="block font-outfit text-xs font-semibold text-text-secondary mb-1.5">User ID</label>
            <div className="input-field text-text-muted flex items-center justify-between">
              <code className="font-price text-xs text-text-muted">{user?.uid?.slice(0, 16)}...</code>
              <button
                onClick={() => { navigator.clipboard.writeText(user?.uid ?? ""); toast.copied(); }}
                className="font-outfit text-[10px] text-primary">
                Copy
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
          className="btn-primary disabled:opacity-50">
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
