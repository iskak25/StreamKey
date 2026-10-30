import Image from "next/image";

const RATIO = 724 / 2172;

export default function Logo({ width = 180, plate = false }: { width?: number; plate?: boolean }) {
  const img = (
    <Image
      src="/logo.png"
      alt="StreamKey — один ключ, один зритель"
      width={width}
      height={Math.round(width * RATIO)}
      priority
    />
  );
  // The artwork has a white background and dark lettering: on dark pages it sits on a light plate.
  return plate ? <div className="logo-plate">{img}</div> : img;
}
