import { notFound } from "next/navigation";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { WishModerationRow } from "./WishModerationRow";

/**
 * Owner moderation for one invitation's guest wishes: every wish (hidden or
 * visible), newest first, each with a button to toggle it. `notFound()`
 * (not a redirect) whenever the invitation doesn't exist or belongs to
 * someone else — the middleware in `auth.config.ts` already keeps signed-out
 * visitors out of `/dashboard/*`, so the only thing left to check here is
 * ownership of this specific invitation.
 */
export default async function WishesModerationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation || invitation.userId !== session.user.id) {
    notFound();
  }

  const wishes = await prisma.wish.findMany({
    where: { invitationId: id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Sổ lời chúc</h1>
      <p className="mt-1 text-sm text-gray-500">
        Ẩn lời chúc không phù hợp — lời chúc bị ẩn sẽ không hiển thị công khai trên thiệp.
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
    </div>
  );
}
