"use client";

import { createContext, useContext } from "react";

export interface CurrentUserInfo {
  user_id: string;
  workspace_id: string;
  email: string;
  role: "admin" | "reviewer" | "viewer";
  can_review: boolean;
}

export const CurrentUserContext = createContext<CurrentUserInfo | null>(null);

/** Read the signed-in user's role/can_review to gate UI elements. Backend
 * endpoints enforce these independently (see app.api.deps.require_role) --
 * this is purely so a viewer doesn't see a button that would just 403,
 * never the actual security boundary. */
export function useCurrentUser(): CurrentUserInfo {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within the (dashboard) layout");
  return ctx;
}

export function canManage(user: CurrentUserInfo): boolean {
  return user.role === "admin";
}

export function canReviewNow(user: CurrentUserInfo): boolean {
  return user.can_review && (user.role === "admin" || user.role === "reviewer");
}
