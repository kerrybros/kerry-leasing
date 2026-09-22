import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { parseDateActionCompletedToYmd, ymdMax } from '../lib/repairDateActionCompleted.js';

const require = createRequire(import.meta.url);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { PrismaClient: AppPrismaClient } = require('../generated/app-client/index.js');
const { PrismaClient: RepairPrismaClient } = require('../generated/repair-client/index.js');

const REPAIR_SHOP_ORG_ID =
  process.env.REPAIR_SHOP_ORG_ID ?? 'org_36whHeTmFumKPNuHkcRY7Yknqvl';

type Provider = 'MOTIVE' | 'SAMSARA' | 'NONE';

type VehicleDay = {
  provider: Provider;
  vehicleKey: string;
  vehicleName: string | null;
  vin: string | null;
  date: string;
  miles: number;
  drivingMinutes: number;
  idleMinutes: number;
  totalFuel: number;
  idleFuel: number;
};

type VehicleAgg = {
  provider: Provider;
  vehicleKey: string;
  vehicleName: string | null;
  vin: string | null;
  activeDays: number;
  miles: number;
  drivingMinutes: number;
  idleMinutes: number;
  totalFuel: number;
  idleFuel: number;
};

type RepairRawRow = {
  id: number;
  unit: string | null;
  number: string | null;
  invoice_date: Date | null;
  order_created_date: Date | null;
  order: string | null;
  shop: string | null;
  service_description: string | null;
  global_service_description: string | null;
  complaint_description: string | null;
  type: string | null;
  component: string | null;
  system: string | null;
  date_action_completed: string | null;
};

type RepairLine = {
  complaint: string | null;
  correction: string;
  component: string | null;
  system: string | null;
  count: number;
  hasDriveUpMention: boolean;
};

type RepairInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  orderCreatedDate: string | null;
  orderClosedDate: string | null;
  orderNumber: string | null;
  shop: string | null;
  lineCount: number;
  lines: RepairLine[];
};

type RepairUnit = {
  unitNumber: string;
  invoiceCount: number;
  lineRowCount: number;
  invoices: RepairInvoice[];
};

type UnitReportRow = {
  fleetName: string;
  orgId: string;
  provider: Provider;
  unitLabel: string;
  unitType: string;
  repairUnitNumber: string | null;
  vin: string | null;
  telematicsVehicleId: string | null;
  telematics: VehicleAgg | null;
  repairs: RepairUnit | null;
  source: 'SERVICE_PLAN' | 'UNMAPPED_TELEMATICS';
};

type FleetReport = {
  orgId: string;
  fleetName: string;
  provider: Provider;
  period: { month: string; from: string; to: string; label: string };
  servicePlanUnitCount: number;
  includedRepairUnits: number;
  includedTelematicsUnits: number;
  unitRows: UnitReportRow[];
  topWorkCategories: Array<{ label: string; count: number }>;
  warnings: string[];
};

function parseArgs() {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (match) args.set(match[1], match[2]);
  }
  return args;
}

function previousMonth(today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid --month value "${month}". Use YYYY-MM.`);
  }
  const [year, monthNum] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 0));
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const label = start.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { month, from, to, label };
}

function toYmd(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;
  return date.toISOString().slice(0, 10);
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normKey(value: string | null | undefined): string | null {
  const s = value?.trim();
  return s ? s.toLowerCase() : null;
}

function textMentionsDriveUp(s: string | null | undefined): boolean {
  return /drive[\s,-]*up|driveup/i.test(s ?? '');
}

function isDamageLine(line: RepairLine): boolean {
  return (
    (line.component ?? '').toLowerCase().includes('damage') ||
    (line.system ?? '').toLowerCase().includes('damage')
  );
}

function isDriveUpInvoice(inv: RepairInvoice): boolean {
  return inv.lines.some((line) => line.hasDriveUpMention);
}

function isDamageInvoice(inv: RepairInvoice): boolean {
  return inv.lines.some(isDamageLine);
}

function avgMpg(v: VehicleAgg | null): number | null {
  if (!v || v.totalFuel <= 0 || v.miles <= 0) return null;
  return v.miles / v.totalFuel;
}

function idlePct(v: VehicleAgg | null): number | null {
  if (!v) return null;
  const engine = v.drivingMinutes + v.idleMinutes;
  if (engine <= 0) return null;
  return (v.idleMinutes / engine) * 100;
}

function hours(minutes: number): number {
  return minutes / 60;
}

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatMaybe(value: number | null, digits = 1, suffix = ''): string {
  return value == null ? '-' : `${formatNumber(value, digits)}${suffix}`;
}

function md(value: unknown): string {
  return String(value ?? '-')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim() || '-';
}

function csv(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'fleet';
}

function aggregateVehicleDays(days: VehicleDay[]): Map<string, VehicleAgg> {
  const map = new Map<string, VehicleAgg>();
  for (const day of days) {
    const existing =
      map.get(day.vehicleKey) ?? {
        provider: day.provider,
        vehicleKey: day.vehicleKey,
        vehicleName: day.vehicleName,
        vin: day.vin,
        activeDays: 0,
        miles: 0,
        drivingMinutes: 0,
        idleMinutes: 0,
        totalFuel: 0,
        idleFuel: 0,
      };
    existing.activeDays += 1;
    existing.miles += day.miles;
    existing.drivingMinutes += day.drivingMinutes;
    existing.idleMinutes += day.idleMinutes;
    existing.totalFuel += day.totalFuel;
    existing.idleFuel += day.idleFuel;
    if (!existing.vin && day.vin) existing.vin = day.vin;
    if (!existing.vehicleName && day.vehicleName) existing.vehicleName = day.vehicleName;
    map.set(day.vehicleKey, existing);
  }
  return map;
}

function aggregateRepairs(rows: RepairRawRow[]): Map<string, RepairUnit> {
  const units = new Map<string, RepairUnit & { invoiceMap: Map<string, RepairInvoice & { lineMap: Map<string, RepairLine> }> }>();

  for (const row of rows) {
    const unitNumber = row.unit?.trim();
    const invoiceNumber = row.number?.trim();
    const invoiceDate = toYmd(row.invoice_date);
    if (!unitNumber || !invoiceNumber || !invoiceDate) continue;

    const unit =
      units.get(unitNumber) ??
      ({
        unitNumber,
        invoiceCount: 0,
        lineRowCount: 0,
        invoices: [],
        invoiceMap: new Map(),
      });

    const invoiceKey = `${invoiceNumber}::${invoiceDate}`;
    const invoice =
      unit.invoiceMap.get(invoiceKey) ??
      ({
        invoiceNumber,
        invoiceDate,
        orderCreatedDate: toYmd(row.order_created_date),
        orderClosedDate: null,
        orderNumber: row.order || null,
        shop: row.shop || null,
        lineCount: 0,
        lines: [],
        lineMap: new Map(),
      });

    invoice.orderClosedDate = ymdMax(
      invoice.orderClosedDate,
      parseDateActionCompletedToYmd(row.date_action_completed)
    );

    const complaintRaw = (row.complaint_description || '').trim();
    const serviceRaw = (row.service_description || row.global_service_description || '').trim();
    if (!complaintRaw && !serviceRaw) continue;

    const lineKey = `${complaintRaw}||${serviceRaw}`;
    const line =
      invoice.lineMap.get(lineKey) ??
      ({
        complaint: complaintRaw || null,
        correction: serviceRaw,
        component: null,
        system: null,
        count: 0,
        hasDriveUpMention: false,
      });

    if (!line.component && row.component && row.component !== 'N/A') line.component = row.component;
    if (!line.system && row.system && row.system !== 'N/A') line.system = row.system;
    line.hasDriveUpMention =
      line.hasDriveUpMention ||
      textMentionsDriveUp(row.complaint_description) ||
      textMentionsDriveUp(row.service_description) ||
      textMentionsDriveUp(row.global_service_description);
    line.count += 1;

    invoice.lineMap.set(lineKey, line);
    invoice.lineCount += 1;
    unit.lineRowCount += 1;
    unit.invoiceMap.set(invoiceKey, invoice);
    units.set(unitNumber, unit);
  }

  const final = new Map<string, RepairUnit>();
  for (const [unitNumber, unit] of units) {
    const invoices = Array.from(unit.invoiceMap.values())
      .map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        orderCreatedDate: inv.orderCreatedDate,
        orderClosedDate: inv.orderClosedDate,
        orderNumber: inv.orderNumber,
        shop: inv.shop,
        lineCount: inv.lineCount,
        lines: Array.from(inv.lineMap.values()).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
    final.set(unitNumber, {
      unitNumber,
      invoiceCount: invoices.length,
      lineRowCount: unit.lineRowCount,
      invoices,
    });
  }
  return final;
}

function summarizeWork(unit: RepairUnit | null): string {
  if (!unit) return '-';
  const counts = new Map<string, number>();
  for (const inv of unit.invoices) {
    for (const line of inv.lines) {
      const label = line.component || line.system || line.correction || line.complaint || 'Uncategorized';
      counts.set(label, (counts.get(label) ?? 0) + line.count);
    }
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => `${label} (${count})`);
  return top.join('; ') || '-';
}

function repairJobStats(unit: RepairUnit | null) {
  if (!unit) return { jobs: 0, lines: 0, driveUps: 0, damage: 0 };
  let driveUps = 0;
  let damage = 0;
  for (const inv of unit.invoices) {
    if (isDriveUpInvoice(inv)) driveUps += 1;
    if (isDamageInvoice(inv)) damage += 1;
  }
  return { jobs: unit.invoiceCount, lines: unit.lineRowCount, driveUps, damage };
}

async function loadFleetReports(app: any, repair: any, period: ReturnType<typeof monthRange>): Promise<FleetReport[]> {
  const [accountsRaw, repairConfigsRaw, settingsRaw, serviceUnitsRaw] = await Promise.all([
    app.telematicsProviderAccount.findMany({ orderBy: { updatedAt: 'desc' } }),
    app.repairCustomerConfig.findMany(),
    app.organizationSettings.findMany(),
    app.servicePlanUnit.findMany({
      where: { isIncluded: true },
      orderBy: [{ clerkOrgId: 'asc' }, { repairUnitNumber: 'asc' }],
    }),
  ]);
  const accounts = accountsRaw as any[];
  const repairConfigs = repairConfigsRaw as any[];
  const settings = settingsRaw as any[];
  const serviceUnits = serviceUnitsRaw as any[];

  const orgIds = new Set<string>();
  for (const account of accounts) orgIds.add(account.clerkOrgId);
  for (const cfg of repairConfigs) orgIds.add(cfg.klOrgId);

  const accountByOrg = new Map(accounts.map((a: any) => [a.clerkOrgId, a]));
  const repairByOrg = new Map(repairConfigs.map((r: any) => [r.klOrgId, r]));
  const settingsByOrg = new Map(settings.map((s: any) => [s.clerkOrgId, s]));
  const serviceByOrg = new Map<string, any[]>();
  for (const unit of serviceUnits) {
    const arr = serviceByOrg.get(unit.clerkOrgId) ?? [];
    arr.push(unit);
    serviceByOrg.set(unit.clerkOrgId, arr);
  }

  const reports: FleetReport[] = [];

  for (const orgId of Array.from(orgIds).sort()) {
    const account = accountByOrg.get(orgId);
    const repairCfg = repairByOrg.get(orgId);
    const rawOrgUnits = serviceByOrg.get(orgId) ?? [];
    const repairBackedTelematicsVins = new Set(
      rawOrgUnits
        .filter((u) => !u.isTelematicsOnly && u.telematicsVin)
        .map((u) => normKey(u.telematicsVin))
        .filter((v): v is string => !!v)
    );
    let duplicateTelematicsOnlyRows = 0;
    const orgUnits = rawOrgUnits.filter((u) => {
      const vin = normKey(u.telematicsVin);
      if (u.isTelematicsOnly && vin && repairBackedTelematicsVins.has(vin)) {
        duplicateTelematicsOnlyRows += 1;
        return false;
      }
      return true;
    });
    const provider = (account?.provider ?? 'NONE') as Provider;
    const fleetName =
      repairCfg?.customerName ||
      settingsByOrg.get(orgId)?.telematicsDashboardUsername ||
      orgId;

    const vehicleDays: VehicleDay[] = [];
    if (provider === 'MOTIVE') {
      const rows = await app.motiveVehicleUtilization.findMany({
        where: { clerkOrgId: orgId, date: { gte: period.from, lte: period.to } },
        select: {
          vehicleId: true,
          vehicleNumber: true,
          vin: true,
          date: true,
          totalDistance: true,
          idleTime: true,
          drivingTime: true,
          totalFuel: true,
          idleFuel: true,
          drivingFuel: true,
        },
      });
      for (const r of rows) {
        vehicleDays.push({
          provider,
          vehicleKey: `motive:${r.vehicleId}`,
          vehicleName: r.vehicleNumber,
          vin: r.vin,
          date: r.date,
          miles: num(r.totalDistance),
          drivingMinutes: num(r.drivingTime),
          idleMinutes: num(r.idleTime),
          totalFuel: num(r.totalFuel),
          idleFuel: num(r.idleFuel),
        });
      }
    } else if (provider === 'SAMSARA') {
      const rows = await app.samsaraVehicleUtilization.findMany({
        where: { clerkOrgId: orgId, date: { gte: period.from, lte: period.to } },
        select: {
          vehicleId: true,
          vehicleName: true,
          vin: true,
          date: true,
          distanceMiles: true,
          drivingMinutes: true,
          idleMinutes: true,
          fuelGallons: true,
          idleFuelGallons: true,
        },
      });
      for (const r of rows) {
        vehicleDays.push({
          provider,
          vehicleKey: `samsara:${r.vehicleId}`,
          vehicleName: r.vehicleName,
          vin: r.vin,
          date: r.date,
          miles: num(r.distanceMiles),
          drivingMinutes: num(r.drivingMinutes),
          idleMinutes: num(r.idleMinutes),
          totalFuel: num(r.fuelGallons),
          idleFuel: num(r.idleFuelGallons),
        });
      }
    }

    const vehicleAggByKey = aggregateVehicleDays(vehicleDays);
    const vehicleByVin = new Map<string, VehicleAgg>();
    for (const v of vehicleAggByKey.values()) {
      const key = normKey(v.vin);
      if (key) vehicleByVin.set(key, v);
    }

    const repairUnitNumbers = orgUnits
      .map((u) => u.repairUnitNumber)
      .filter((n): n is string => !!n);

    let repairRows: RepairRawRow[] = [];
    if (repairCfg?.customerName && repairUnitNumbers.length > 0) {
      repairRows = await repair.revenue_details.findMany({
        where: {
          organization_id: REPAIR_SHOP_ORG_ID,
          customer: { equals: repairCfg.customerName, mode: 'insensitive' },
          unit: { in: repairUnitNumbers },
          invoice_date: {
            gte: new Date(`${period.from}T00:00:00.000Z`),
            lte: new Date(`${period.to}T00:00:00.000Z`),
          },
        },
        select: {
          id: true,
          unit: true,
          number: true,
          invoice_date: true,
          order_created_date: true,
          order: true,
          shop: true,
          service_description: true,
          global_service_description: true,
          complaint_description: true,
          type: true,
          component: true,
          system: true,
          date_action_completed: true,
        },
        orderBy: [{ unit: 'asc' }, { invoice_date: 'desc' }],
      });
    }
    const repairsByUnit = aggregateRepairs(repairRows);

    const consumedVehicleKeys = new Set<string>();
    const unitRows: UnitReportRow[] = [];

    for (const u of orgUnits) {
      const byVin = normKey(u.telematicsVin) ? vehicleByVin.get(normKey(u.telematicsVin)!) : null;
      const byProviderId = u.telematicsVehicleId
        ? vehicleAggByKey.get(`${provider.toLowerCase()}:${u.telematicsVehicleId}`)
        : null;
      const telematics = byVin ?? byProviderId ?? null;
      if (telematics) consumedVehicleKeys.add(telematics.vehicleKey);

      const repairsForUnit = u.repairUnitNumber ? repairsByUnit.get(u.repairUnitNumber) ?? null : null;
      unitRows.push({
        fleetName,
        orgId,
        provider,
        unitLabel:
          u.customUnitName ||
          u.repairUnitNumber ||
          telematics?.vehicleName ||
          u.telematicsVin ||
          u.telematicsVehicleId ||
          'Unlabeled unit',
        unitType: u.unitType ?? 'UNSET',
        repairUnitNumber: u.repairUnitNumber ?? null,
        vin: u.telematicsVin ?? u.repairVin ?? telematics?.vin ?? null,
        telematicsVehicleId: u.telematicsVehicleId ?? telematics?.vehicleKey ?? null,
        telematics,
        repairs: repairsForUnit,
        source: 'SERVICE_PLAN',
      });
    }

    for (const telematics of vehicleAggByKey.values()) {
      if (consumedVehicleKeys.has(telematics.vehicleKey)) continue;
      unitRows.push({
        fleetName,
        orgId,
        provider,
        unitLabel: telematics.vehicleName || telematics.vin || telematics.vehicleKey,
        unitType: 'UNMAPPED',
        repairUnitNumber: null,
        vin: telematics.vin,
        telematicsVehicleId: telematics.vehicleKey,
        telematics,
        repairs: null,
        source: 'UNMAPPED_TELEMATICS',
      });
    }

    const categoryCounts = new Map<string, number>();
    for (const row of unitRows) {
      for (const inv of row.repairs?.invoices ?? []) {
        for (const line of inv.lines) {
          const label = line.component || line.system || 'Uncategorized';
          categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + line.count);
        }
      }
    }

    const warnings: string[] = [];
    if (!repairCfg) warnings.push('Repair customer config is missing.');
    if (!account) warnings.push('Telematics provider account is missing.');
    if (orgUnits.length === 0) warnings.push('No included service-plan units found.');
    if (duplicateTelematicsOnlyRows > 0) {
      warnings.push(
        `${duplicateTelematicsOnlyRows} duplicate telematics-only service-plan rows were suppressed because the VIN is already matched to a repair-backed unit.`
      );
    }
    const servicePlanWithNoTelematics = unitRows.filter(
      (r) => r.source === 'SERVICE_PLAN' && !r.telematics
    ).length;
    if (servicePlanWithNoTelematics > 0) {
      warnings.push(`${servicePlanWithNoTelematics} included service-plan units have no telematics rows in the month.`);
    }
    const unmappedTelematics = unitRows.filter((r) => r.source === 'UNMAPPED_TELEMATICS').length;
    if (unmappedTelematics > 0) {
      warnings.push(`${unmappedTelematics} telematics vehicles are not mapped to an included service-plan unit.`);
    }

    reports.push({
      orgId,
      fleetName,
      provider,
      period,
      servicePlanUnitCount: orgUnits.length,
      includedRepairUnits: repairUnitNumbers.length,
      includedTelematicsUnits: orgUnits.filter((u) => u.telematicsVin || u.telematicsVehicleId).length,
      unitRows: unitRows.sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true })),
      topWorkCategories: Array.from(categoryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([label, count]) => ({ label, count })),
      warnings,
    });
  }

  return reports;
}

function fleetTotals(report: FleetReport) {
  const rows = report.unitRows;
  const telematics = rows.map((r) => r.telematics).filter((v): v is VehicleAgg => !!v);
  const repairs = rows.map((r) => r.repairs).filter((r): r is RepairUnit => !!r);
  const miles = telematics.reduce((sum, v) => sum + v.miles, 0);
  const totalFuel = telematics.reduce((sum, v) => sum + v.totalFuel, 0);
  const idleFuel = telematics.reduce((sum, v) => sum + v.idleFuel, 0);
  const idleMinutes = telematics.reduce((sum, v) => sum + v.idleMinutes, 0);
  const drivingMinutes = telematics.reduce((sum, v) => sum + v.drivingMinutes, 0);
  const repairJobs = repairs.reduce((sum, r) => sum + r.invoiceCount, 0);
  const repairLines = repairs.reduce((sum, r) => sum + r.lineRowCount, 0);
  let driveUps = 0;
  let damage = 0;
  for (const repair of repairs) {
    for (const inv of repair.invoices) {
      if (isDriveUpInvoice(inv)) driveUps += 1;
      if (isDamageInvoice(inv)) damage += 1;
    }
  }
  return {
    units: rows.filter((r) => r.source === 'SERVICE_PLAN').length,
    telematicsUnits: telematics.length,
    repairUnits: repairs.length,
    miles,
    totalFuel,
    idleFuel,
    idleMinutes,
    drivingMinutes,
    avgMpg: totalFuel > 0 ? miles / totalFuel : null,
    idlePct:
      idleMinutes + drivingMinutes > 0 ? (idleMinutes / (idleMinutes + drivingMinutes)) * 100 : null,
    repairJobs,
    repairLines,
    driveUps,
    damage,
  };
}

function renderFleetMarkdown(report: FleetReport): string {
  const totals = fleetTotals(report);
  const topIdle = report.unitRows
    .filter((r) => r.telematics && (r.telematics.drivingMinutes + r.telematics.idleMinutes) > 0)
    .sort((a, b) => (idlePct(b.telematics) ?? 0) - (idlePct(a.telematics) ?? 0))
    .slice(0, 5);
  const topRepairs = report.unitRows
    .filter((r) => r.repairs)
    .sort((a, b) => repairJobStats(b.repairs).jobs - repairJobStats(a.repairs).jobs)
    .slice(0, 8);

  const lines: string[] = [];
  lines.push(`# ${report.fleetName} - Month-End Fleet Report`);
  lines.push('');
  lines.push(`Period: ${report.period.label} (${report.period.from} to ${report.period.to})`);
  lines.push(`Provider: ${report.provider}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| Included service-plan units | ${totals.units} |`);
  lines.push(`| Units with telematics activity | ${totals.telematicsUnits} |`);
  lines.push(`| Units with repair work | ${totals.repairUnits} |`);
  lines.push(`| Total miles | ${formatNumber(totals.miles)} |`);
  lines.push(`| Fleet MPG | ${formatMaybe(totals.avgMpg, 2)} |`);
  lines.push(`| Total fuel | ${formatNumber(totals.totalFuel, 1)} gal |`);
  lines.push(`| Idle fuel | ${formatNumber(totals.idleFuel, 1)} gal |`);
  lines.push(`| Idle time | ${formatNumber(hours(totals.idleMinutes), 1)} hrs |`);
  lines.push(`| Idle percentage | ${formatMaybe(totals.idlePct, 1, '%')} |`);
  lines.push(`| Repair jobs | ${totals.repairJobs} |`);
  lines.push(`| Repair line rows | ${totals.repairLines} |`);
  lines.push(`| Drive-up jobs | ${totals.driveUps} |`);
  lines.push(`| Damage jobs | ${totals.damage} |`);
  lines.push('');

  if (report.warnings.length > 0) {
    lines.push('## Data Notes');
    lines.push('');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }

  lines.push('## Top Work Categories');
  lines.push('');
  if (report.topWorkCategories.length === 0) {
    lines.push('No repair work categories found for this month.');
  } else {
    lines.push('| Category | Line Rows |');
    lines.push('|---|---:|');
    for (const row of report.topWorkCategories) {
      lines.push(`| ${md(row.label)} | ${row.count} |`);
    }
  }
  lines.push('');

  lines.push('## Highest Idle Percentage');
  lines.push('');
  if (topIdle.length === 0) {
    lines.push('No telematics idle data found for this month.');
  } else {
    lines.push('| Unit | Miles | Idle % | Idle Hrs | Idle Fuel | MPG |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const row of topIdle) {
      lines.push(
        `| ${md(row.unitLabel)} | ${formatNumber(row.telematics!.miles)} | ${formatMaybe(idlePct(row.telematics), 1, '%')} | ${formatNumber(hours(row.telematics!.idleMinutes), 1)} | ${formatNumber(row.telematics!.idleFuel, 1)} gal | ${formatMaybe(avgMpg(row.telematics), 2)} |`
      );
    }
  }
  lines.push('');

  lines.push('## Units With The Most Repair Jobs');
  lines.push('');
  if (topRepairs.length === 0) {
    lines.push('No repair jobs found for this month.');
  } else {
    lines.push('| Unit | Jobs | Lines | Drive-up | Damage | Top Work |');
    lines.push('|---|---:|---:|---:|---:|---|');
    for (const row of topRepairs) {
      const stats = repairJobStats(row.repairs);
      lines.push(
        `| ${md(row.unitLabel)} | ${stats.jobs} | ${stats.lines} | ${stats.driveUps} | ${stats.damage} | ${md(summarizeWork(row.repairs))} |`
      );
    }
  }
  lines.push('');

  lines.push('## Vehicle Summary');
  lines.push('');
  lines.push('| Unit | Type | VIN | Miles | MPG | Idle % | Idle Hrs | Fuel | Repair Jobs | Work Summary |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|---|');
  for (const row of report.unitRows) {
    const repairStats = repairJobStats(row.repairs);
    lines.push(
      `| ${md(row.unitLabel)} | ${md(row.unitType)} | ${md(row.vin)} | ${formatNumber(row.telematics?.miles ?? 0)} | ${formatMaybe(avgMpg(row.telematics), 2)} | ${formatMaybe(idlePct(row.telematics), 1, '%')} | ${formatNumber(hours(row.telematics?.idleMinutes ?? 0), 1)} | ${formatNumber(row.telematics?.totalFuel ?? 0, 1)} gal | ${repairStats.jobs} | ${md(summarizeWork(row.repairs))} |`
    );
  }
  lines.push('');

  lines.push('## Repair Detail');
  lines.push('');
  for (const row of report.unitRows.filter((r) => r.repairs)) {
    lines.push(`### ${row.unitLabel}`);
    lines.push('');
    for (const inv of row.repairs!.invoices) {
      const flags = [
        isDriveUpInvoice(inv) ? 'drive-up' : null,
        isDamageInvoice(inv) ? 'damage' : null,
      ].filter(Boolean);
      lines.push(
        `- ${inv.invoiceDate}: invoice ${inv.invoiceNumber}` +
          `${inv.orderNumber ? `, order ${inv.orderNumber}` : ''}` +
          `${inv.shop ? `, shop ${inv.shop}` : ''}` +
          `${inv.orderCreatedDate ? `, opened ${inv.orderCreatedDate}` : ''}` +
          `${inv.orderClosedDate ? `, closed ${inv.orderClosedDate}` : ''}` +
          `${flags.length ? ` (${flags.join(', ')})` : ''}`
      );
      for (const line of inv.lines) {
        const label = [line.component, line.system].filter(Boolean).join(' / ');
        lines.push(
          `  - ${label ? `${label}: ` : ''}${line.complaint ? `Complaint: ${line.complaint}. ` : ''}` +
            `${line.correction ? `Correction: ${line.correction}.` : ''}`
        );
      }
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function buildCsvs(reports: FleetReport[]) {
  const fleetSummary = [
    [
      'fleet',
      'org_id',
      'provider',
      'service_plan_units',
      'telematics_units',
      'repair_units',
      'miles',
      'avg_mpg',
      'idle_pct',
      'idle_hours',
      'total_fuel_gal',
      'idle_fuel_gal',
      'repair_jobs',
      'repair_lines',
      'drive_up_jobs',
      'damage_jobs',
    ],
  ];

  const vehicleSummary = [
    [
      'fleet',
      'org_id',
      'provider',
      'unit',
      'unit_type',
      'vin',
      'source',
      'miles',
      'avg_mpg',
      'driving_hours',
      'idle_hours',
      'idle_pct',
      'total_fuel_gal',
      'idle_fuel_gal',
      'repair_jobs',
      'repair_lines',
      'drive_up_jobs',
      'damage_jobs',
      'work_summary',
    ],
  ];

  const repairDetail = [
    [
      'fleet',
      'org_id',
      'unit',
      'invoice_date',
      'invoice_number',
      'order_number',
      'order_created_date',
      'order_closed_date',
      'shop',
      'component',
      'system',
      'complaint',
      'correction',
      'line_rows',
      'drive_up',
      'damage',
    ],
  ];

  for (const report of reports) {
    const totals = fleetTotals(report);
    fleetSummary.push([
      report.fleetName,
      report.orgId,
      report.provider,
      String(totals.units),
      String(totals.telematicsUnits),
      String(totals.repairUnits),
      String(Math.round(totals.miles)),
      totals.avgMpg == null ? '' : totals.avgMpg.toFixed(2),
      totals.idlePct == null ? '' : totals.idlePct.toFixed(1),
      hours(totals.idleMinutes).toFixed(1),
      totals.totalFuel.toFixed(1),
      totals.idleFuel.toFixed(1),
      String(totals.repairJobs),
      String(totals.repairLines),
      String(totals.driveUps),
      String(totals.damage),
    ]);

    for (const row of report.unitRows) {
      const stats = repairJobStats(row.repairs);
      vehicleSummary.push([
        report.fleetName,
        report.orgId,
        report.provider,
        row.unitLabel,
        row.unitType,
        row.vin ?? '',
        row.source,
        String(Math.round(row.telematics?.miles ?? 0)),
        avgMpg(row.telematics)?.toFixed(2) ?? '',
        hours(row.telematics?.drivingMinutes ?? 0).toFixed(1),
        hours(row.telematics?.idleMinutes ?? 0).toFixed(1),
        idlePct(row.telematics)?.toFixed(1) ?? '',
        (row.telematics?.totalFuel ?? 0).toFixed(1),
        (row.telematics?.idleFuel ?? 0).toFixed(1),
        String(stats.jobs),
        String(stats.lines),
        String(stats.driveUps),
        String(stats.damage),
        summarizeWork(row.repairs),
      ]);

      for (const inv of row.repairs?.invoices ?? []) {
        for (const line of inv.lines) {
          repairDetail.push([
            report.fleetName,
            report.orgId,
            row.unitLabel,
            inv.invoiceDate,
            inv.invoiceNumber,
            inv.orderNumber ?? '',
            inv.orderCreatedDate ?? '',
            inv.orderClosedDate ?? '',
            inv.shop ?? '',
            line.component ?? '',
            line.system ?? '',
            line.complaint ?? '',
            line.correction ?? '',
            String(line.count),
            isDriveUpInvoice(inv) ? 'yes' : 'no',
            isDamageLine(line) ? 'yes' : 'no',
          ]);
        }
      }
    }
  }

  return {
    fleetSummary: fleetSummary.map((row) => row.map(csv).join(',')).join('\n') + '\n',
    vehicleSummary: vehicleSummary.map((row) => row.map(csv).join(',')).join('\n') + '\n',
    repairDetail: repairDetail.map((row) => row.map(csv).join(',')).join('\n') + '\n',
  };
}

async function main() {
  const args = parseArgs();
  const period = monthRange(args.get('month') ?? previousMonth());
  const repoRoot = path.resolve(process.cwd(), '../..');
  const outDir = path.resolve(
    args.get('outDir') ?? path.join(repoRoot, 'reports', 'month-end', period.month)
  );

  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is not set.');
  if (!process.env.REPAIR_DATABASE_URL) throw new Error('REPAIR_DATABASE_URL is not set.');

  const app = new AppPrismaClient({
    datasources: { db: { url: process.env.APP_DATABASE_URL } },
  });
  const repair = new RepairPrismaClient({
    datasources: { db: { url: process.env.REPAIR_DATABASE_URL } },
  });

  try {
    await fs.mkdir(path.join(outDir, 'fleets'), { recursive: true });
    const reports = await loadFleetReports(app, repair, period);
    const included = reports.filter((report) => report.unitRows.length > 0);

    const masterLines: string[] = [];
    masterLines.push(`# Kerry Leasing Month-End Fleet Reports - ${period.label}`);
    masterLines.push('');
    masterLines.push(`Period: ${period.from} to ${period.to}`);
    masterLines.push(`Generated: ${new Date().toISOString()}`);
    masterLines.push('');
    masterLines.push('## Fleet Summary');
    masterLines.push('');
    masterLines.push('| Fleet | Provider | Units | Miles | MPG | Idle % | Repair Jobs | Drive-up | Damage | Detail |');
    masterLines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---|');

    for (const report of included) {
      const totals = fleetTotals(report);
      const file = `${slug(report.fleetName)}.md`;
      await fs.writeFile(path.join(outDir, 'fleets', file), renderFleetMarkdown(report));
      masterLines.push(
        `| ${md(report.fleetName)} | ${report.provider} | ${totals.units} | ${formatNumber(totals.miles)} | ${formatMaybe(totals.avgMpg, 2)} | ${formatMaybe(totals.idlePct, 1, '%')} | ${totals.repairJobs} | ${totals.driveUps} | ${totals.damage} | [open](fleets/${file}) |`
      );
    }

    const totalAll = included.reduce(
      (acc, report) => {
        const t = fleetTotals(report);
        acc.units += t.units;
        acc.telematicsUnits += t.telematicsUnits;
        acc.repairJobs += t.repairJobs;
        acc.repairLines += t.repairLines;
        acc.miles += t.miles;
        acc.fuel += t.totalFuel;
        acc.idleFuel += t.idleFuel;
        acc.idleMinutes += t.idleMinutes;
        acc.drivingMinutes += t.drivingMinutes;
        acc.driveUps += t.driveUps;
        acc.damage += t.damage;
        return acc;
      },
      {
        units: 0,
        telematicsUnits: 0,
        repairJobs: 0,
        repairLines: 0,
        miles: 0,
        fuel: 0,
        idleFuel: 0,
        idleMinutes: 0,
        drivingMinutes: 0,
        driveUps: 0,
        damage: 0,
      }
    );

    const allMpg = totalAll.fuel > 0 ? totalAll.miles / totalAll.fuel : null;
    const allIdlePct =
      totalAll.idleMinutes + totalAll.drivingMinutes > 0
        ? (totalAll.idleMinutes / (totalAll.idleMinutes + totalAll.drivingMinutes)) * 100
        : null;

    masterLines.push('');
    masterLines.push('## All Fleets Rollup');
    masterLines.push('');
    masterLines.push('| Metric | Value |');
    masterLines.push('|---|---:|');
    masterLines.push(`| Fleets reported | ${included.length} |`);
    masterLines.push(`| Included units | ${totalAll.units} |`);
    masterLines.push(`| Units with telematics activity | ${totalAll.telematicsUnits} |`);
    masterLines.push(`| Total miles | ${formatNumber(totalAll.miles)} |`);
    masterLines.push(`| Fleet MPG | ${formatMaybe(allMpg, 2)} |`);
    masterLines.push(`| Idle percentage | ${formatMaybe(allIdlePct, 1, '%')} |`);
    masterLines.push(`| Idle fuel | ${formatNumber(totalAll.idleFuel, 1)} gal |`);
    masterLines.push(`| Repair jobs | ${totalAll.repairJobs} |`);
    masterLines.push(`| Repair line rows | ${totalAll.repairLines} |`);
    masterLines.push(`| Drive-up jobs | ${totalAll.driveUps} |`);
    masterLines.push(`| Damage jobs | ${totalAll.damage} |`);
    masterLines.push('');
    masterLines.push('## CSV Exports');
    masterLines.push('');
    masterLines.push('- [Fleet summary](fleet-summary.csv)');
    masterLines.push('- [Vehicle summary](vehicle-summary.csv)');
    masterLines.push('- [Repair line detail](repair-line-detail.csv)');
    masterLines.push('');

    const csvs = buildCsvs(included);
    await fs.writeFile(path.join(outDir, 'README.md'), masterLines.join('\n') + '\n');
    await fs.writeFile(path.join(outDir, 'fleet-summary.csv'), csvs.fleetSummary);
    await fs.writeFile(path.join(outDir, 'vehicle-summary.csv'), csvs.vehicleSummary);
    await fs.writeFile(path.join(outDir, 'repair-line-detail.csv'), csvs.repairDetail);

    console.log(`Month-end report written to ${outDir}`);
    console.log(`Fleets: ${included.length}`);
    console.log(`Period: ${period.from} to ${period.to}`);
  } finally {
    await app.$disconnect();
    await repair.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
