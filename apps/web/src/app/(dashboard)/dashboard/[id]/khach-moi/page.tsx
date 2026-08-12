import { notFound } from "next/navigation";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { findOwnedInvitation } from "@/lib/ownership";
import { GuestTable, type Guest } from "./GuestTable";

/**
 * Owner-only guest management for one invitation: quick-add, personalized
 * links, view status. `notFound()` (not a redirect) whenever the invitation
 * doesn't exist or belongs to someone else — same convention as the wishes
 * moderation (`loi-chuc`) and responses (`phan-hoi`) sibling pages, and
 * `findOwnedInvitation` makes that check indistinguishable-by-design between
 * "no such id" and "not yours", same as the guests API routes it backs
 * (Task 1) already do.
 */
export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) {
    notFound();
  }

  const guests = await prisma.guest.findMany({
    where: { invitationId: id },
    orderBy: { createdAt: "desc" },
  });

  const initialGuests: Guest[] = guests.map((guest) => ({
    id: guest.id,
    name: guest.name,
    group: guest.group,
    token: guest.token,
    viewedAt: guest.viewedAt ? guest.viewedAt.toISOString() : null,
    createdAt: guest.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Khách mời</h1>
      <p className="mt-1 text-sm text-gray-500">
        Thêm khách và gửi cho mỗi người một liên kết thiệp cá nhân hoá riêng.
      </p>

      <div className="mt-6">
        <GuestTable
          invitationId={id}
          slug={invitation.slug}
          status={invitation.status}
          initialGuests={initialGuests}
          origin={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
        />
      </div>
    </div>
  );
}
