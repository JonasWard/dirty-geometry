export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/icon.svg"
      alt="dirty-geometry logo"
      width={size}
      height={size}
      className="select-none shrink-0"
    />
  );
}
