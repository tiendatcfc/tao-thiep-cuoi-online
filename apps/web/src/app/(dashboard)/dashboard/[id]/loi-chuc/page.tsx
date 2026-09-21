import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { PAGE_SIZE, pageRange, resolvePage, totalPagesFor } from "@/lib/pagination";
import { WishModerationRow } from "./WishModerationRow";

/**
 * Owner moderation for one invitation's guest wishes: every wish (hidden or
 * visible), newest first, each with a button to toggle it. `notFound()`
 * (not a redirect) whenever the invitation doesn't exist or belongs to
 * someone else — the middleware in `auth.config.ts` already keeps signed-out
 * visitors out of `/dashboard/*`, so the only thing left to check here is
 * ownership of this specific invitation.
 *
 * Paginated at `PAGE_SIZE`, sharing `?trang=` and the helpers with the
 * responses page. This page renders one interactive row per wish, and it is
 * the page a couple opens ON the wedding day — the moment when wishes arrive
 * fastest and the list is longest. Unpaginated, a popular invitation made
 * the server render every wish it had ever received, every time the couple
 * checked for new ones.
 */
export default async function WishesModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation || invitation.userId !== session.user.id) {
    notFound();
  }

  const totalWishes = await prisma.wish.count({ where: { invitationId: id } });
  const totalPages = totalPagesFor(totalWishes);
  const page = resolvePage(query.trang, totalPages);

  const wishes = await prisma.wish.findMany({
    where: { invitationId: id },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const { first: firstOnPage, last: lastOnPage } = pageRange(page, wishes.length, totalWishes);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Sổ lời chúc</h1>
      <p className="mt-1 text-sm text-gray-500">
        Ẩn lời chúc không phù hợp — lời chúc bị ẩn sẽ không hiển thị công khai trên thiệp.
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {totalWishes === 0
          ? "Chưa có lời chúc nào."
          : `Đang hiện ${firstOnPage}–${lastOnPage} trong ${totalWishes} lời chúc (trang ${page}/${totalPages}).`}
      </p>

      {wishes.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">Chưa có lời chúc nào.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {wishes.map((wish) => (
            <WishModerationRow
              key={wish.id}
              invitationId={id}
              wishId={wish.id}
              guestName={wish.guestName}
              message={wish.message}
              createdAt={wish.createdAt.toISOString()}
              initialIsHidden={wish.isHidden}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Phân trang lời chúc">
          {page > 1 ? (
            <Link
              href={`/dashboard/${id}/loi-chuc?trang=${page - 1}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              ← Trang trước
            </Link>
          ) : (
            <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-300">
              ← Trang trước
            </span>
          )}
          <span className="text-sm text-gray-600">
            Trang {page}/{totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/dashboard/${id}/loi-chuc?trang=${page + 1}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              Trang sau →
            </Link>
          ) : (
            <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-300">
              Trang sau →
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
