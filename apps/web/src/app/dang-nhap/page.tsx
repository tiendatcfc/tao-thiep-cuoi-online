import { signIn } from "@/auth";
import { sanitizeNextPath } from "@/lib/safe-redirect";

/**
 * Honors `?next=` (e.g. the gallery's `/dang-nhap?next=/mau-thiep` link for
 * an unauthenticated "Dùng mẫu này" click) by passing it to Auth.js as
 * `redirectTo`, so signing in lands the user back where they meant to go
 * instead of always at `/dashboard`. `sanitizeNextPath` guards against an
 * open redirect — the raw query value is never trusted directly.
 */
export default async function DangNhapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = sanitizeNextPath(params.next);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight text-gray-900">
          HPWD
        </h1>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Đăng nhập bằng Google
          </button>
        </form>
      </div>
    </div>
  );
}
