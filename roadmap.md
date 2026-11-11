# Remove fictional data
- [x] Room administration: seat menus, invites, microphone/seat locks and owner-assigned admins.
- [x] Full room tools: mode, theme, editing, chat switch, private chat, sharing, settings, charisma display, diagnostics, lock, announcement, blacklist, gift store and room impressions.
- [x] Verify room administration SQL (16 rules plus existing room/routing tests) and isolated phone/desktop sheets.
- [ ] Apply supabase/011_room_tools.sql in the external SQL Editor and verify signed-in room flows and LiveKit audio on two accounts (needs the user; external authentication unavailable).
- [x] Remove sample streams, stories, events, and notifications.
- [x] Remove sample chats and online people.
- [x] Remove fabricated profile identity, stats, levels, and balances.
- [x] Remove sample photographs and review remaining pages.
- [x] Verify empty pages, navigation, and tests.

# Rename application
- [x] Change the application name to voli inside all pages and page titles.
- [x] Confirm no old application name remains in project source.

# Consistent screen sizes
- [x] Use a shared screen-sized layout across all pages.
- [x] Scroll long content inside the screen with stationary bottom navigation.
- [x] Verify page dimensions and scrolling on phone and desktop.

# External account setup
- [x] Prepare starter SQL with profiles, private sequential UIDs, random seven-digit public IDs, follows, streams, and direct messages.
- [x] Prepare sign-in and signup forms with display name and email, without a username field.
- [x] Verify form validation and SQL account rules.
- [x] Wire signup, sign-in, and sign-out to the user's external project.
- [ ] Apply sql/voli-starter.sql in the project's SQL Editor (needs the user).

# Re-runnable starter SQL
- [x] Make sql/voli-starter.sql safe to run repeatedly; add bio and updated_at to existing profiles.
- [x] Move account_uids to public (fully closed to clients) and use public.handle_new_user trigger.
- [x] Refresh follows, streams, messages policies; verify with PGlite tests (fresh, rerun, older schema).

# Levels
- [x] Charisma (diamonds received) and wealth (coins spent) levels, 100 each, placeholder totals in SQL.
- [x] Show both levels with progress on the profile.
- [ ] Run supabase/001_levels.sql in the SQL Editor (needs the user).
- [ ] Real per-level numbers (user will send later).
- [ ] Gifts that actually add points (not built yet).

# Level badges
- [x] Wealth badges (11) on the profile, with the level number written on each.
- [x] Charisma badges (11) on the levels page and profile.

# CP relationship card
- [x] Remove green background and use the supplied gold-and-purple card in account details.
- [x] Position the account avatar within the right frame and preserve the left chair and ruby heart.
- [x] Verify the card at phone and desktop sizes using an isolated visual fixture; real external-account access is unverified.
- [x] Always fill the right frame: the account avatar, or a first-letter fallback when there is none or the picture fails to load.

# VIP dragon system (8 tiers)
- [x] SQL update supabase/003_vip.sql: tiers table with every feature, grants (purchase/admin/gift/event) with expiry, coins balance, purchase function, admin grant/revoke, room moderation + immunity rules, invisible/hide-location settings.
- [x] Tests for VIP rules (PGlite).
- [x] VIP page listing the 8 tiers and features; own settings (hide location, invisible mode).
- [x] Placeholder frame, chat badge, chat bubble, name colour; special ID card picked by new tiers.
- [ ] Run supabase/003_vip.sql in the SQL Editor (needs the user).
- [x] VIP 1 chat badge and bronze entrance bar pictures (green background removed); entrance preview on the VIP page.
- [x] VIP 2 silver dragon entrance bar (green background removed), its own entrance key silver_dragon_bar.
- [x] VIP 2 silver chat bubble (stretchable, see-through like VIP 1) and VIP 2 silver badge.
- [x] VIP 3 gold and VIP 4 purple badges, chat bubbles and entrance bars (green background removed).
- [x] VIP 5 ruby and VIP 6 emerald badges, chat bubbles and entrance bars.
- [ ] Real artwork for the other badges, frames, bubbles, entrances, ID cards (user will send).
- [x] Upload the latest updates to GitHub (hmdagency3-boop/voli).
- [ ] Prices, durations, monthly salary amounts, friends-list sizes (user will decide).
- [ ] Stream rooms, entrances, join banner, system broadcast (rooms not built yet).

# Party rooms
- [x] Room button on the home page opens the room setup page (mic/video, cover + name, theme, seats, lock, announcement, start).
- [x] Room page: owner header, live member count, mic seats, chat tabs, announcement, share, leave/end party, remove a member.
- [x] Live rooms listed on the home page.
- [x] supabase/004_rooms.sql with PGlite tests.
- [ ] Run supabase/004_rooms.sql in the SQL Editor (needs the user).
- [x] Live voice on the mics through LiveKit: seated members talk, everyone inside listens (src/lib/voice.functions.ts, src/hooks/use-room-voice.ts).
- [ ] Gifts, games, room tasks (not built yet).

# Keep GitHub up to date
- [x] Push every finished update to hmdagency3-boop/voli as soon as it is done (user is low on credits).

# VIP 1 profile card
- [x] Popped-up profile card for VIP 1 members uses the dragon frame, full screen width, anchored at the bottom like everyone else's card.

# VIP badge readability
- [x] Enlarge tier tabs and add a full-art badge to tier details; review shared badge sizes and verify phone/desktop layouts in an isolated visual fixture (external-account access remains unverified).

# Agencies
- [x] Apply to open an agency; management approves; code given in order from 200.
- [x] Hosts search by code, send a join request; agent accepts/rejects, removes hosts.
- [x] Agent dashboard: this week / last week diamonds, members income by week, my income by month.
- [x] Income counts only while the host is active in the agency (tests in src/test/agencies.test.ts).
- [ ] Run supabase/008_agencies.sql in the SQL Editor (needs the user).
- [ ] Agency share %, exit fees and leaving rules (waiting on the app policy).
- [x] Upload to GitHub.

# Sign-in gate flash
- [x] No inside page may show, even for a moment, before the login page on refresh while signed out.

# Agent dashboard artwork
- [x] Cut the supplied agency artwork into dragon crest, gold panel, gold buttons and five icons; use them on the agent dashboard.
- [ ] Exit fees row shows "soon" until the exit-fee policy is decided.

# Remove management pages
- [x] Delete all management routes, their dedicated interface and sign-in code.
- [x] Preserve member pages, existing bans and external database rules.
- [x] Verify removed addresses no longer match management pages and member sign-in still opens.

# Voli Helper (management notices)
- [x] Pinned receive-only chat for the management account (public ID 100), named Voli Helper.
- [x] Small "V" badge beside its name in the chat list and the conversation header.
- [x] Prepare dedicated non-login Voli Helper profile creation, link its profile from the chat, and verify ID 100 / receive-only rules with PGlite.
- [ ] Apply the updated supabase/010_admin_notices.sql in the external SQL Editor (needs the user; earlier version was applied).

# Profile identity dragon
- [x] Clean the supplied dragon and split its placement behind the identity card with paws in front.
- [x] Verify mascot/paws layering and unobstructed data in an isolated card fixture at 320px, 390px and desktop; real signed-in external-account view remains unverified.

# Voli logo and home-screen icons
- [x] Use the supplied mascot logo in the home header and sign-in/signup pages.
- [x] Add manifest-only installation metadata, favicon, Apple icon and safe maskable Android icon.
- [x] Verify logo display on the sign-in screen, manifest/icon requests on phone and desktop, correct PNG sizes and no service worker; actual phone installation remains untested.

# Room voice controls
- [x] Mic on/off switch moved into the bottom action row next to the games and gift buttons; the mobile "شغّل الصوت" tap stays above the chat.
- [x] Verify the bottom row (input + mic + games + gift) fits with no sideways overflow at 320px, 390px and desktop; real in-room use with two signed-in devices remains unverified.

# Trophy button see-through fill
- [x] The room ranking button's dark inside is now mostly see-through (20% of its old opacity) so the room frame behind it shows; gold frame, trophy and coin stay solid.
- [x] Verify the button over the room frame artwork in an isolated fixture; the real room header with a signed-in account remains unverified.

# Linked device bans
- [x] Link account bans to historical device visits, even on another device, and assign ban codes starting at 200.
- [x] Show the applicable ban code and reason; verified 25 tests including SQL fresh, rerun and upgrade, and isolated ban screen at desktop/320px/390px.
- [ ] Apply updated supabase/015_device_bans.sql and verify real signed-in external-account bans (needs external SQL access).

# Video gifts
- [x] Database: gift video link, management function to set it, one show per send for everyone inside (supabase/019_video_gifts.sql), tested.
- [x] Room: play the video for everyone inside, one after another; mark video gifts in the gift box.
- [ ] Run supabase/019_video_gifts.sql in the SQL Editor (needs the user).
- [ ] Add video upload to the Voli Admin Dashboard gifts page (separate project; needs the user to ask there).

# Profile pictures
- [x] Crop (drag, zoom, turn) every avatar and album picture before upload on the edit page.
- [x] Profile cover shows the album pictures, sliding between them; falls back to the avatar when the album is empty.
- [x] تصحيح الرفع: جميع تحديثات التطبيق على main؛ فرع لوحة-الادارة بقي دون تغيير ويخصص لتحديثات لوحة الإدارة فقط.

# Store (المتجر) and backpack
- [x] Database: store items (frames and rides, 4 categories), buying with coins, backpack, wearing, management functions (supabase/023_store.sql) with tests.
- [x] App: store page (frames / rides tabs, categories, preview, purchase) and backpack page (days left, wear / take off).
- [x] Show worn frames on profiles and room seats; ride plays when its owner enters a room.
- [x] Management panel (already built in the separate Voli Admin Dashboard project): store page to add/edit/hide/delete items, upload pictures and videos, give an item to a member.
- [ ] Push app to main on GitHub (waits on the GitHub connection).
- [ ] Run supabase/023_store.sql in the SQL Editor (needs the user).
- [x] Match the app's store and backpack to the panel's own sql/023_store.sql (frame/ride kinds, style, days, UUID ids, store_buy / store_equip).
