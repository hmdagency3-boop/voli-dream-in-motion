# Components

- AuthGate decides from both the address and the page actually on screen (canShowPage), because the router keeps the previous page mounted while it moves, so a signed-out visitor never glimpses an inside page and a signed-in member never glimpses login.
- RoomGames posts each game result as a normal room chat line through sendRoomMessage, so results reach everyone inside without new SQL; games are listed in src/lib/room-games.ts and only "ready" ones can be played.
- AuthGate calls deviceCheckIn (src/lib/device-check.functions.ts, SQL in supabase/015_device_bans.sql) on every open so the IP comes from server request headers; a failed check never blocks the app.
- Profile pictures are cropped in the browser (react-easy-crop + canvas in src/lib/crop-image.ts) before Cloudinary upload, so stored avatars/album pictures are already square and small; the profile cover reads album-or-avatar through coverPictures().
