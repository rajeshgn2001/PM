"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/Icons";
import { changePassword, deleteAccount, fetchProfile, type UserProfile } from "@/lib/api";

type AccountDialogProps = {
  onClose: () => void;
  onAccountDeleted: () => void;
};

type Status = { kind: "success" | "error"; text: string } | null;

const inputClass =
  "mt-1 w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)] focus:bg-white";
const labelClass = "block text-xs font-semibold uppercase tracking-wider text-[var(--navy-dark)]";

const StatusMessage = ({ status }: { status: Status }) =>
  status && (
    <p
      role={status.kind === "error" ? "alert" : "status"}
      className={status.kind === "error" ? "text-sm text-red-700" : "text-sm text-green-700"}
    >
      {status.text}
    </p>
  );

export const AccountDialog = ({ onClose, onAccountDeleted }: AccountDialogProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<Status>(null);

  useEffect(() => {
    // The profile line is informational, so a failed fetch just leaves it out.
    fetchProfile().then(setProfile).catch(() => {});
  }, []);

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwords.next.length < 6) {
      setPasswordStatus({ kind: "error", text: "New password must be at least 6 characters" });
      return;
    }
    try {
      await changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "" });
      setPasswordStatus({ kind: "success", text: "Password updated. Other sessions were signed out." });
    } catch (error) {
      setPasswordStatus({ kind: "error", text: (error as Error).message });
    }
  };

  const handleDeleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm("Permanently delete your account and all of your boards?")) {
      return;
    }
    try {
      await deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (error) {
      setDeleteStatus({ kind: "error", text: (error as Error).message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-dark)]/30 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        className="w-full max-w-md space-y-6 rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="account-title" className="font-display text-xl font-semibold text-[var(--navy-dark)]">
              Account settings
            </h2>
            {profile && (
              <p className="mt-1 text-xs text-[var(--gray-text)]">
                Signed in as <span className="font-semibold">{profile.username}</span>, member since{" "}
                {profile.created_at.slice(0, 10)}, {profile.board_count}{" "}
                {profile.board_count === 1 ? "board" : "boards"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
            aria-label="Close account settings"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--navy-dark)]">Change password</h3>
          <label className={labelClass}>
            Current password
            <input
              type="password"
              required
              value={passwords.current}
              onChange={(event) => setPasswords((prev) => ({ ...prev, current: event.target.value }))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            New password
            <input
              type="password"
              required
              value={passwords.next}
              onChange={(event) => setPasswords((prev) => ({ ...prev, next: event.target.value }))}
              className={inputClass}
            />
          </label>
          <StatusMessage status={passwordStatus} />
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:brightness-110"
          >
            Update password
          </button>
        </form>

        <form onSubmit={handleDeleteAccount} className="space-y-3 border-t border-[var(--stroke)] pt-5">
          <h3 className="text-sm font-semibold text-red-700">Delete account</h3>
          <p className="text-xs text-[var(--gray-text)]">This permanently removes your account and every board.</p>
          <label className={labelClass}>
            Confirm with your password
            <input
              type="password"
              required
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              className={inputClass}
            />
          </label>
          <StatusMessage status={deleteStatus} />
          <button
            type="submit"
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-700 hover:bg-red-100"
          >
            Delete account
          </button>
        </form>
      </div>
    </div>
  );
};
