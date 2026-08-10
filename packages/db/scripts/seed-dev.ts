import { createDefaultDocument } from '@hpwd/schema'
import { prisma } from '../src/index'

/**
 * Local dev fixture: one demo user with one published invitation at
 * `/i/demo`, plus a guest link (`/i/demo?g=demo-guest-token`) so the
 * guest-name / "Kính mời" flow can be exercised without a real DB browse.
 * Idempotent (upserts throughout) so it's safe to re-run after `db:migrate`
 * resets the local database.
 */
async function main() {
  const document = createDefaultDocument()

  const user = await prisma.user.upsert({
    where: { email: 'demo@hpwd.local' },
    update: {},
    create: {
      email: 'demo@hpwd.local',
      name: 'Demo User',
    },
  })

  const invitation = await prisma.invitation.upsert({
    where: { slug: 'demo' },
    update: {
      document,
      publishedDocument: document,
      status: 'published',
      publishedAt: new Date(),
    },
    create: {
      slug: 'demo',
      userId: user.id,
      document,
      publishedDocument: document,
      status: 'published',
      publishedAt: new Date(),
    },
  })

  await prisma.guest.upsert({
    where: { token: 'demo-guest-token' },
    update: { name: 'Nguyễn Văn An', invitationId: invitation.id },
    create: {
      token: 'demo-guest-token',
      name: 'Nguyễn Văn An',
      invitationId: invitation.id,
    },
  })

  console.log(`Seeded invitation "demo" (id=${invitation.id}) for user ${user.email}`)
  console.log('  -> http://localhost:3000/i/demo')
  console.log('  -> http://localhost:3000/i/demo?g=demo-guest-token')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
