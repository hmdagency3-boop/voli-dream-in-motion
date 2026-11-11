<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Use AppScreen for application pages so viewport sizing, internal scrolling, and stationary navigation remain consistent across routes.
- Keep starter external database SQL in sql/ re-runnable (if-not-exists, drop-then-create policies/triggers, explicit revoke+grant because Supabase grants new public tables to app roles by default) and verify it with PGlite on fresh, rerun and upgrade-from-fixture databases; internal UIDs live in public.account_uids with RLS on, no policies and no app-role grants, so clients can never read them.
- AccountForm shares login and signup validation and talks to the user's own external project through src/lib/supabase.ts (publishable key only, RLS enforces access); signup with no session means email confirmation is required, never a signed-in redirect.
- Level badge pictures are image files stored in the repo under src/assets/badges/ (imported by Vite, not CDN pointers, so they travel with the code) mapped to level ranges in src/lib/badges.ts (with per-badge text position); LevelBadge writes "Lv.N" on each badge's empty plate, so the plate position lives with each badge.
- Special ID (الايدي المميز) lives on profiles.special_id and is admin-set only via SQL (no member update grant); supabase/002_special_id.sql blocks clashes with public IDs by raising unique_violation so signup ID generation retries. Its frame pictures are repo files in src/assets/special-id/, picked by the VIP tier's id_card in src/lib/special-id.ts.
- VIP rules live in the database (supabase/003_vip.sql): vip_tiers holds one column per feature, every way of getting VIP is a vip_grants row, and profiles.vip_level/vip_expires_at is a trigger-maintained cache for display, so rules stay enforceable server-side; room rules use the live vip_level_of(). src/lib/vip.ts mirrors the tiers for display only and must change together with the SQL; read VIP through activeVipLevel() so ended tiers never show.
- Member search on the home page looks up profiles by normal public ID or special ID only (src/lib/user-search.ts), reading through the signed-in client under the existing profiles read policy, so no extra database access is needed.
- CP artwork uses a cropped transparent asset with percentage-based avatar positioning inside its right frame, so the gold frames and center heart remain intact at every screen width. The right frame always holds the account picture: the avatar when one exists, otherwise a first-letter fallback, so the artwork's person icon is never left exposed.
- VIP badge, entrance and popped-up profile-card pictures are repo files in src/assets/vip/ mapped in src/lib/vip-art.ts; entrance bars are keyed by the tier's entrance key (same as vip_tiers.entrance) with the name-plate box stored per picture, and profile cards store the empty inner window's insets per picture, so a tier shows its own art only once its picture exists.
- Use VipBadge's compact, tab and showcase size variants for their respective placements so full artwork scales consistently without cropping or local height overrides.
- When uploading files to GitHub through the connector, create each blob with the Blobs API and put the returned sha in the tree; base64 passed as the tree's content field gets stored as literal text, corrupting the file.
- Party rooms live in supabase/004_rooms.sql: members only read the room tables and every change goes through security-definer functions (start_party, enter_room, take_seat, send_room_message, kick_from_room…), so seat, lock and kick rules stay server-side; presence is a last_seen heartbeat, and the room page reaches a room by its owner's public ID (one room per member). src/lib/rooms.ts mirrors the seat counts and themes and must change together with the SQL.
- Room "came in" lines and entrance bars for other members are detected in the browser by comparing who is present between refreshes (no extra SQL), so they show only to people already inside and are not saved.
- Coins thrown inside a room live in supabase/005_room_coins.sql: the room_coins table is closed to the app (RLS on, no policies, no app-role grants), so both directions go through security-definer functions — throw_room_coins debits the thrower's own profiles.coins and room_coins_total reads the room sum — and src/lib/rooms.ts mirrors the throw amounts for display only.
- Room gifts live in supabase/006_room_gifts.sql: prices are rows in room_gift_catalog (members read, admin edits via SQL), and send_room_gift charges price × count × recipients in one security-definer call, adds wealth/charisma points and writes one room_coins row per recipient so gifts count in the room total. A gift's picture is its catalog art_url, else its src/assets/gifts/ file mapped in src/lib/gifts.ts; a gift with neither is hidden, and the read falls back to old columns when art_url is missing.
- The room ranking (supporters and gift receivers, day/week/month) is computed in supabase/007_room_ranking.sql from the closed room_coins table by a security-definer function that only answers people inside the room, so no new table or grant is needed; RoomRanking loads it itself each time it opens.
- Agencies live in supabase/008_agencies.sql: agencies, applications, memberships (one row per stay, kept after leaving) and join requests are read-only to members under RLS, and every change goes through security-definer functions; codes come from a sequence starting at 200 at approval; income is computed from room_coins gifts only inside membership stays, so a host's gifts count for an agency only while active. src/lib/agency.ts is the only client entry point.
- The app has no management routes or separate management sign-in; existing external SQL rules remain intact, and AuthGate reads my_ban() through src/lib/member-ban.ts so removing the panel does not disable existing member bans.
- Voli Helper (ID 100, supabase/010) is pinned first in /chat via pinAdminNotices (src/lib/messages.ts), read-only since SQL blocks messages to it; sql/014 sends grant notices from an admin_actions trigger so panel functions stay unchanged.
