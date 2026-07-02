import Link from "next/link";

type Props = {
  /** Taille compacte pour le header mobile */
  compact?: boolean;
};

/**
 * Logo Geoffrey Mahieu — GM Mental Coach.
 * Utilise public/logo-gm.png s'il est présent, sinon une reproduction
 * typographique fidèle aux couleurs du logo (pastille + wordmark).
 * Pour intégrer le fichier officiel : déposer logo-gm.png dans public/.
 */
export default function Logo({ compact = false }: Props) {
  const markSize = compact ? "h-7 w-7 text-[15px]" : "h-10 w-10 text-[22px]";
  return (
    <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
      <span
        className={`${markSize} flex shrink-0 items-center justify-center rounded-full bg-white font-playfair font-bold text-[#143648]`}
        aria-hidden="true"
      >
        G
      </span>
      <span className="leading-tight">
        <span className={`block font-extrabold tracking-wide text-white ${compact ? "text-[11px]" : "text-sm"}`}>
          GE<span className="text-[#FF7A5C]">O</span>FFREY MAHIEU
        </span>
        <span className={`block font-medium text-[#FF9B85] ${compact ? "text-[9px]" : "text-[11px]"}`}>
          GM Mental Coach
        </span>
      </span>
    </Link>
  );
}
