import dragon from "@/assets/profile-dragon-peeking.png";

/** Split the same cutout into a rear mascot and front paws around the card edge. */
export function ProfileDragon({ paws = false }: { paws?: boolean }) {
  return (
    <img
      src={dragon}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`profile-dragon pointer-events-none absolute left-1/2 w-44 max-w-[54%] -translate-x-1/2 select-none ${paws ? "profile-dragon-paws z-20" : "z-0"}`}
    />
  );
}