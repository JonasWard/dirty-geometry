import { basePath } from "@/config";

export default function Logo({ size = 32 }: { size?: number }) {
  const iconSrc = `${basePath}/icon.svg`.replace(/\/{2,}/g, "/");
  return (
    <img
      src={iconSrc}
      alt="dirty-geometry logo"
      width={size}
      height={size}
      className="select-none shrink-0"
    />
  );
}
