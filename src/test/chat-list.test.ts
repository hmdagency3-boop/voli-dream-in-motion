import { describe, expect, it } from "vitest";
import { pinAdminNotices, type ChatPartner, type ConversationSummary } from "@/lib/messages";

const person = (id: string, public_id: number): ChatPartner => ({ auth_id: id, public_id, display_name: id, avatar_url: null });
const convo = (p: ChatPartner, at: string, unread = 0): ConversationSummary => ({
  partner: p, unread,
  last: { id: `${p.auth_id}-${at}`, sender_id: p.auth_id, recipient_id: "me", body: "hi", created_at: at, read_at: null },
});
const helper = person("helper", 100);

describe("chat list", () => {
  it("pins Voli Helper (ID 100) first even when another chat is newer", () => {
    const list = pinAdminNotices([convo(person("a", 1234567), "2026-11-08T23:00:00Z"), convo(helper, "2026-11-01T00:00:00Z", 2)], helper);
    expect(list.map((i) => i.partner?.public_id)).toEqual([100, 1234567]);
    expect(list[0]!.pinned).toBe(true);
    expect(list[0]!.unread).toBe(2);
  });

  it("shows Voli Helper for every member, even with no notices yet", () => {
    expect(pinAdminNotices([], helper)).toEqual([{ partner: helper, last: null, unread: 0, pinned: true }]);
  });

  it("keeps the pinned row when the helper account is missing from the database", () => {
    const list = pinAdminNotices([], null);
    expect(list).toHaveLength(1);
    expect(list[0]!.pinned).toBe(true);
  });

  it("orders the other chats newest first", () => {
    const list = pinAdminNotices([
      convo(person("old", 1111111), "2026-11-01T00:00:00Z"),
      convo(person("new", 2222222), "2026-11-08T00:00:00Z"),
    ], helper);
    expect(list.map((i) => i.partner?.auth_id)).toEqual(["helper", "new", "old"]);
  });
});
