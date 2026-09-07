export function Logo({ size = 74 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"
         style={{ margin: "0 auto 16px", display: "block", position: "relative", zIndex: 2 }}>
      <path d="M50 6 C68 24, 84 40, 84 60 C84 79, 68 94, 50 94 C32 94, 16 79, 16 60 C16 40, 32 24, 50 6 Z" fill="#1E6FF5" />
      <path d="M50 18 L74 46 L62 46 L62 82 L38 82 L38 46 L26 46 Z" fill="#FFFFFF" />
      <rect x="44" y="30" width="6" height="6" fill="#0A1848" />
      <rect x="52" y="30" width="6" height="6" fill="#0A1848" />
      <rect x="44" y="38" width="6" height="6" fill="#0A1848" />
      <rect x="52" y="38" width="6" height="6" fill="#0A1848" />
      <path d="M58 48 C63 48 67 52 67 57 C67 60 65.5 63 63 64.5 L63 86 C63 88 61.5 90 58 90 C54.5 90 53 88 53 86 L53 64.5 C50.5 63 49 60 49 57 C49 52 53 48 58 48 Z" fill="#0A1848" />
    </svg>
  );
}
