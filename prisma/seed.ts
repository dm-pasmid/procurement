/**
 * Seed: sections, items, vendors, settings, and one user per role.
 * Users are created in Supabase Auth via the service-role key and linked to
 * Profile rows (Profile.id === auth.users.id). Idempotent — safe to re-run.
 *
 * Requires DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { PrismaClient, Role } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe@Pms1";

const SECTIONS = [
  { code: "NEZ", name: "Nezarath" },
  { code: "EST", name: "Establishment" },
  { code: "JUD", name: "Judicial" },
  { code: "ELE", name: "Election" },
  { code: "DEV", name: "Development" },
  { code: "RTI", name: "RTI Cell" },
  { code: "REC", name: "Record Room" },
  { code: "IT", name: "IT Cell" },
];

const ITEMS: { name: string; category: string; unit: string }[] = [
  { name: "A4 Paper Ream 75 GSM", category: "Stationery", unit: "ream" },
  { name: "A3 Paper Ream 75 GSM", category: "Stationery", unit: "ream" },
  { name: "Toner Cartridge HP 88A", category: "Consumables", unit: "piece" },
  { name: "Toner Cartridge HP 12A", category: "Consumables", unit: "piece" },
  { name: "Ball Point Pen (Blue)", category: "Stationery", unit: "piece" },
  { name: "File Cover (Kraft)", category: "Stationery", unit: "piece" },
  { name: "Register (200 pages)", category: "Stationery", unit: "piece" },
  { name: "Stapler No. 10", category: "Stationery", unit: "piece" },
  { name: "Staple Pins No. 10", category: "Stationery", unit: "box" },
  { name: "Executive Chair", category: "Furniture", unit: "piece" },
  { name: "Visitor Chair", category: "Furniture", unit: "piece" },
  { name: "Steel Almirah", category: "Furniture", unit: "piece" },
  { name: "Computer Mouse (USB)", category: "IT Hardware", unit: "piece" },
  { name: "Keyboard (USB)", category: "IT Hardware", unit: "piece" },
  { name: "Extension Board (4 socket)", category: "Electrical", unit: "piece" },
];

const VENDORS = [
  {
    name: "M/s Midnapore Stationers",
    gstin: "19AAAPM1234A1Z5",
    address: "Station Road, Midnapore, Paschim Medinipur",
    phone: "9830000001",
    email: "sales@midnaporestationers.example",
    empanelled: true,
    empanelmentRef: "DM/PM/EMP/2025/01",
    empanelmentValidTill: new Date("2027-03-31"),
  },
  {
    name: "M/s Kharagpur Office Supplies",
    gstin: "19AAAPK5678B1Z3",
    address: "Inda, Kharagpur, Paschim Medinipur",
    phone: "9830000002",
    email: "kos@kharagpursupplies.example",
    empanelled: true,
    empanelmentRef: "DM/PM/EMP/2025/02",
    empanelmentValidTill: new Date("2027-03-31"),
  },
  {
    name: "M/s Bengal Furniture House",
    gstin: "19AAAPB9012C1Z1",
    address: "Keranitola, Midnapore",
    phone: "9830000003",
    empanelled: false,
  },
  {
    name: "M/s Digital Infotech Solutions",
    gstin: "19AAAPD3456D1Z9",
    address: "Golbazar, Kharagpur",
    phone: "9830000004",
    email: "info@digitalinfotech.example",
    empanelled: false,
  },
  {
    name: "M/s Medinipur Electricals",
    address: "Rajabazar, Midnapore",
    phone: "9830000005",
    empanelled: false,
  },
];

const USERS: {
  email: string;
  name: string;
  designation: string;
  role: Role;
  sectionCode: string;
}[] = [
  { email: "dm@pms.local", name: "District Magistrate", designation: "District Magistrate & Collector", role: Role.DM, sectionCode: "NEZ" },
  { email: "adm@pms.local", name: "Additional District Magistrate", designation: "Additional District Magistrate (General)", role: Role.ADM, sectionCode: "NEZ" },
  { email: "ndc@pms.local", name: "Nezarath Deputy Collector", designation: "Nezarath Deputy Collector", role: Role.NDC, sectionCode: "NEZ" },
  { email: "oc.establishment@pms.local", name: "OC Establishment", designation: "Officer-in-Charge, Establishment", role: Role.OC, sectionCode: "EST" },
  { email: "clerk.establishment@pms.local", name: "Establishment Clerk", designation: "Upper Division Clerk", role: Role.INITIATOR, sectionCode: "EST" },
  { email: "nezarath.clerk@pms.local", name: "Nezarath Clerk", designation: "Nezarath Clerk", role: Role.NEZARATH_CLERK, sectionCode: "NEZ" },
  { email: "admin@pms.local", name: "System Administrator", designation: "System Administrator", role: Role.ADMIN, sectionCode: "IT" },
];

const SETTINGS: Record<string, string> = {
  SO_TERMS_TEMPLATE: [
    "1. Payment: 100% within 30 days of acceptance of goods against pre-receipted bill in triplicate.",
    "2. Delivery: within the period stated above, at the indicated section, during office hours.",
    "3. Penalty: delayed or short supply attracts liquidated damages as per the penalty clause of the empanelment / tender conditions.",
    "4. Goods found defective or not conforming to specification will be rejected and must be replaced free of cost.",
    "5. This supply order is subject to the general terms of WBFR and orders of the Government of West Bengal.",
  ].join("\n"),
  ADM_LIMIT: "20000",
  EST_TOLERANCE_PCT: "10",
  SPLIT_WINDOW_DAYS: "30",
  PRICE_DEV_PCT: "15",
  FREQ_COUNT: "3",
  FREQ_WINDOW_DAYS: "90",
  APPROVAL_SLA_HOURS: "48",
  PROC_IDLE_DAYS: "7",
  GRN_NO_BILL_DAYS: "30",
  BILL_UNPAID_DAYS: "30",
  QTY_MULTIPLIER: "2",
};

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes("<project-ref>")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env to seed auth users.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Create the auth user if missing; return its id. */
async function ensureAuthUser(
  admin: ReturnType<typeof supabaseAdmin>,
  email: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SEED_USER_PASSWORD,
    email_confirm: true,
  });
  if (!error) return data.user.id;

  // Already exists → find it. pms.local seed users fit in one page.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!existing) {
    throw new Error(`Could not create or find auth user ${email}: ${error.message}`);
  }
  return existing.id;
}

async function main() {
  // Sections
  for (const s of SECTIONS) {
    await prisma.section.upsert({
      where: { code: s.code },
      update: { name: s.name },
      create: s,
    });
  }
  console.log(`Sections: ${SECTIONS.length}`);

  // Items
  for (const item of ITEMS) {
    await prisma.item.upsert({
      where: { name_unit: { name: item.name, unit: item.unit } },
      update: { category: item.category },
      create: item,
    });
  }
  console.log(`Items: ${ITEMS.length}`);

  // Vendors (no natural unique key — match by name)
  for (const v of VENDORS) {
    const existing = await prisma.vendor.findFirst({ where: { name: v.name } });
    if (existing) {
      await prisma.vendor.update({ where: { id: existing.id }, data: v });
    } else {
      await prisma.vendor.create({ data: v });
    }
  }
  console.log(`Vendors: ${VENDORS.length}`);

  // Settings
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {}, // never overwrite a tuned value on re-seed
      create: { key, value },
    });
  }
  console.log(`Settings: ${Object.keys(SETTINGS).length}`);

  // Auth users + profiles
  const admin = supabaseAdmin();
  const sections = await prisma.section.findMany();
  const sectionByCode = new Map(sections.map((s) => [s.code, s.id]));

  for (const u of USERS) {
    const userId = await ensureAuthUser(admin, u.email);
    const sectionId = sectionByCode.get(u.sectionCode);
    if (!sectionId) throw new Error(`Section ${u.sectionCode} missing`);
    await prisma.profile.upsert({
      where: { id: userId },
      update: {
        name: u.name,
        designation: u.designation,
        role: u.role,
        sectionId,
      },
      create: {
        id: userId,
        name: u.name,
        designation: u.designation,
        role: u.role,
        sectionId,
      },
    });
    console.log(`User: ${u.email} (${u.role})`);
  }

  // The seeded ADM starts in charge of every section; adjust in Sections & Users.
  const admProfile = await prisma.profile.findFirst({ where: { role: Role.ADM } });
  if (admProfile) {
    for (const section of sections) {
      await prisma.admSection.upsert({
        where: {
          admId_sectionId: { admId: admProfile.id, sectionId: section.id },
        },
        update: {},
        create: { admId: admProfile.id, sectionId: section.id },
      });
    }
    console.log(`ADM sections: ${sections.length} mapped to ${admProfile.name}`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
