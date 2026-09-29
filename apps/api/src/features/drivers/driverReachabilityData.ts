/**
 * Gathers the reachability picture from the app DB for every active Motive org.
 * Kept separate from driverReachability.ts so the rules stay pure and testable.
 */
import type { PrismaClient } from '../../generated/app-client/index.js';
import type { DriverReachabilityInput, StalePhoneHolder } from './driverReachability.js';

/** Long enough to catch anyone genuinely working, short enough to ignore leavers. */
export const DEFAULT_LOOKBACK_DAYS = 14;

function ymdDaysAgo(days: number, now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function gatherDriverReachability(
  prisma: PrismaClient,
  now: Date = new Date(),
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS
): Promise<{ drivers: DriverReachabilityInput[]; stalePhoneHolders: StalePhoneHolder[] }> {
  const since = ymdDaysAgo(lookbackDays, now);
  const drivers: DriverReachabilityInput[] = [];
  const stalePhoneHolders: StalePhoneHolder[] = [];

  // Only orgs that actually send a weekly report. Scoping this to every active
  // Motive account raises false alarms: a customer with telematics but no weekly
  // report has every driver "unreachable" by definition, which is not a fault.
  // This mirrors runWeeklyDriverSms, which selects on the same enabled flag.
  const enabled = await prisma.customerSmsReportConfig.findMany({
    where: { enabled: true },
    select: { clerkOrgId: true },
  });
  const orgs = await prisma.telematicsProviderAccount.findMany({
    where: {
      provider: 'MOTIVE',
      status: 'ACTIVE',
      clerkOrgId: { in: enabled.map((e) => e.clerkOrgId) },
    },
    select: { clerkOrgId: true },
  });

  for (const { clerkOrgId } of orgs) {
    // Drivers with engine time in the window. Admin-hidden drivers (isIncluded
    // false) are deliberately skipped: test rigs and shop accounts live there,
    // and hiding one is how an admin says "this is not a person to report on".
    const util = await prisma.motiveDriverUtilization.groupBy({
      by: ['driverId'],
      where: {
        clerkOrgId,
        date: { gte: since },
        OR: [{ drivingTime: { gt: 0 } }, { idleTime: { gt: 0 } }],
        driverId: { not: null },
      },
      _count: { date: true },
    });
    if (util.length === 0) continue;

    const ids = util.map((u) => u.driverId!).filter((x) => x != null);
    const masters = await prisma.motiveDriverMaster.findMany({
      where: { clerkOrgId, motiveDriverId: { in: ids } },
      select: { motiveDriverId: true, firstName: true, lastName: true, isIncluded: true, status: true },
    });
    const masterById = new Map(masters.map((m) => [m.motiveDriverId, m]));

    const contacts = await prisma.driverContact.findMany({
      where: { clerkOrgId },
      select: {
        displayName: true, motiveDriverId: true, phoneE164: true,
        enrolled: true, optedOut: true, smsConsentStatus: true,
      },
    });
    const contactByMotiveId = new Map(contacts.filter((c) => c.motiveDriverId != null).map((c) => [c.motiveDriverId!, c]));

    for (const u of util) {
      const id = u.driverId!;
      const m = masterById.get(id);
      if (m && !m.isIncluded) continue; // admin hid this one on purpose
      const c = contactByMotiveId.get(id);
      const name = m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() : (c?.displayName ?? `Motive driver ${id}`);
      drivers.push({
        clerkOrgId,
        motiveDriverId: id,
        displayName: name || `Motive driver ${id}`,
        activeDays: u._count.date,
        hasContact: c != null,
        hasPhone: !!c?.phoneE164,
        enrolled: c?.enrolled ?? false,
        optedOut: c?.optedOut ?? false,
        consentConfirmed: c?.smsConsentStatus === 'CONFIRMED',
      });
    }

    // A phone on a contact whose Motive driver has left. That is the shape of a
    // reissued number: the departed driver keeps it and the new one cannot have it.
    const allMasters = await prisma.motiveDriverMaster.findMany({
      where: { clerkOrgId },
      select: { motiveDriverId: true, status: true },
    });
    const statusById = new Map(allMasters.map((m) => [m.motiveDriverId, (m.status ?? '').toLowerCase()]));
    for (const c of contacts) {
      if (!c.phoneE164 || c.motiveDriverId == null) continue;
      const status = statusById.get(c.motiveDriverId);
      if (status && status !== 'active') {
        stalePhoneHolders.push({
          clerkOrgId,
          displayName: c.displayName,
          phoneLast4: c.phoneE164.slice(-4),
          motiveStatus: status,
        });
      }
    }
  }

  return { drivers, stalePhoneHolders };
}
