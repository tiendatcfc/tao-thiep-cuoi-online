import { qrMatrix, qrModulePath } from "@/lib/qr-svg";

/**
 * Drop-in replacement for `react-qr-code`'s `<QRCode value size />`, with
 * the same defaults (type number auto, error correction "L", black on
 * white) and the same module matrix — see `lib/qr-svg.ts` for why the
 * markup is a fraction of the size.
 *
 * Deliberately NOT a client component: a QR code is a pure function of its
 * payload, so it renders once on the server and ships as plain SVG.
 */
export function QrCode({
  value,
  size,
  className,
  "data-testid": testId,
}: {
  value: string;
  size: number;
  className?: string;
  "data-testid"?: string;
}) {
  const { count, modules } = qrMatrix(value);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      // Without this the 1-unit module edges are antialiased when the
      // viewBox is scaled up to `size`, which softens the black/white
      // boundary a phone camera is looking for.
      shapeRendering="crispEdges"
      className={className}
      data-testid={testId}
      role="img"
    >
      {/* The light modules, as the one rectangle they always were. */}
      <rect width={count} height={count} fill="#FFFFFF" />
      <path d={qrModulePath(modules)} fill="#000000" />
    </svg>
  );
}
