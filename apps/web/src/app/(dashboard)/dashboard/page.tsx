import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@hpwd/db";
import { auth, signOut } from "@/auth";
import { toInvitationSummary } from "@/lib/invitations";
import { InvitationList } from "./InvitationList";

/**
 * The signed-in couple's home base: greeting, a prominent link into the
 * template gallery to start a new invitation, and every invitation they
 * own as a card (see `InvitationList`/`InvitationCard`). The middleware in
 * `auth.config.ts` already redirects signed-out visitors away from
 * `/dashboard/*`, so the `redirect` below is defense-in-depth, matching
 * every other protected page's convention.
 */
export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/dang-nhap");
  }

  const invitations = await prisma.invitation.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      status: true,
      publishedAt: true,
      viewCount: true,
      updatedAt: true,
      document: true,
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Xin chào {session.user.name ?? session.user.email}
        </h1>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Đăng xuất
          </button>
        </form>
      </div>

      <div className="mt-6">
        <Link
          href="/mau-thiep"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          + Tạo thiệp mới
        </Link>
      </div>

      <div className="mt-8">
        <InvitationList invitations={invitations.map(toInvitationSummary)} />
      </div>
    </div>
  );
}
