-- CreateTable
CREATE TABLE "InvitationSlug" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationSlug_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvitationSlug_slug_key" ON "InvitationSlug"("slug");

-- CreateIndex
CREATE INDEX "InvitationSlug_invitationId_idx" ON "InvitationSlug"("invitationId");

-- AddForeignKey
ALTER TABLE "InvitationSlug" ADD CONSTRAINT "InvitationSlug_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (Phase 1 Hardening Task 2): every invitation already published
-- before this migration ran has, until now, had no slug-history row at all.
-- Without this INSERT, the moment this migration lands, every one of those
-- pre-existing slugs would be immediately squattable by anyone (the new
-- uniqueness check in the publish route only consults InvitationSlug, and an
-- unpublish/re-slug on the current row would leave no trace of the old
-- slug). One row per currently-published invitation, using its current
-- slug, closes that gap for the exact set of invitations already live.
-- Draft invitations are skipped: they have never been served publicly under
-- their slug, so there is nothing to protect yet.
INSERT INTO "InvitationSlug" ("id", "invitationId", "slug", "createdAt")
SELECT gen_random_uuid()::text, "id", "slug", COALESCE("publishedAt", CURRENT_TIMESTAMP)
FROM "Invitation"
WHERE "status" = 'published';
