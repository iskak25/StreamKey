import Image from "next/image";

// logo-neon.png: transparent neon logo (720x176), made for the dark theme.
const RATIO = 176 / 720;

export default function Logo({ width = 180, priority = true }: { width?: number; priority?: boolean }) {
  return (
    <Image
      src="/logo-neon.png"
      alt="StreamKey — один ключ, один зритель"
      width={width}
      height={Math.round(width * RATIO)}
      priority={priority}
    />
  );
}
