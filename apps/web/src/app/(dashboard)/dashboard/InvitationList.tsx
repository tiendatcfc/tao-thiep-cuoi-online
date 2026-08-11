import Link from "next/link";
import { InvitationCard, type DashboardInvitation } from "./InvitationCard";

export interface InvitationListProps {
  invitations: DashboardInvitation[];
}

/**
 * Wraps `dashboard/page.tsx`'s invitation cards vs. the empty state, kept
 * as its own module so both can be exercised in a test without a database
 * (`page.tsx` itself just does the Prisma fetch + auth check).
 */
export function InvitationList({ invitations }: InvitationListProps) {
  if (invitations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center">
        <p className="text-sm text-gray-500">
          Bạn chưa có thiệp nào. Hãy chọn một mẫu để bắt đầu tạo thiệp cưới của riêng bạn.
        </p>
        <Link href="/mau-thiep" className="mt-4 inline-block text-sm font-medium text-gray-900 underline">
          Xem mẫu thiệp
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {invitations.map((invitation) => (
        <InvitationCard key={invitation.id} invitation={invitation} />
      ))}
    </ul>
  );
}
