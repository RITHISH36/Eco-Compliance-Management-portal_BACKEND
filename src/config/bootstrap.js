import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Report from "../models/Report.js";
import { CAMPUS_BLOCK_COORDS, getCampusBlockCoords } from "../utils/campusBlocks.js";
import { generateReportNumber } from "../utils/reportNumber.js";

const demoUsers = [
  { name: "Arun Prakash", email: "arun.prakash@student.baiet.edu", phone: "9876511201", volunteer: true },
  { name: "Nivetha Sri", email: "nivetha.sri@student.baiet.edu", phone: "9876511202", volunteer: false },
  { name: "Karthik Raj", email: "karthik.raj@student.baiet.edu", phone: "9876511203", volunteer: true },
  { name: "Harini Devi", email: "harini.devi@student.baiet.edu", phone: "9876511204", volunteer: false },
  { name: "Vignesh M", email: "vignesh.m@student.baiet.edu", phone: "9876511205", volunteer: false },
  { name: "Keerthana S", email: "keerthana.s@student.baiet.edu", phone: "9876511206", volunteer: true },
];

const demoReports = [
  {
    type: "Garbage Overflow Near Canteen",
    category: "Garbage Overflow",
    block: "CAFETARIA",
    spot: "Main Dustbin Area",
    description: "Waste bins are overflowing near the canteen entrance during lunch hours.",
    department: "Sanitation",
    status: "Resolved",
    reporterEmail: "arun.prakash@student.baiet.edu",
    progress: 100,
    tone: "success",
    ecoMember: "Priya",
    assigneeContact: "+91 98765 55001",
  },
  {
    type: "Water Leakage in Mechanical Block",
    category: "Water Leakage",
    block: "MECH",
    spot: "Ground Floor Corridor",
    description: "Continuous water leakage from the ceiling near the lab entrance.",
    department: "Plumber",
    status: "In Progress",
    reporterEmail: "nivetha.sri@student.baiet.edu",
    progress: 55,
    tone: "warning",
    ecoMember: "Harini",
    assigneeContact: "+91 98765 33002",
  },
  {
    type: "Broken Street Light Near Parking",
    category: "Street Light",
    block: "Parking",
    spot: "Two-Wheeler Parking",
    description: "Street light is not working near the parking area after 7 PM.",
    department: "Electrician",
    status: "Resolved",
    reporterEmail: "karthik.raj@student.baiet.edu",
    progress: 100,
    tone: "success",
    ecoMember: "Gokul",
    assigneeContact: "+91 98765 22001",
  },
  {
    type: "Plastic Waste Behind Boys Hostel",
    category: "Plastic Waste",
    block: "Boys Hostel",
    spot: "Backside Open Area",
    description: "Plastic cups and snack wrappers are scattered behind the hostel block.",
    department: "Eco Cell",
    status: "In Progress",
    reporterEmail: "harini.devi@student.baiet.edu",
    progress: 45,
    tone: "warning",
    ecoMember: "Priya",
    assigneeContact: "+91 98765 55002",
  },
  {
    type: "Clogged Drain Near Girls Hostel",
    category: "Water Leakage",
    block: "Girls Hostel",
    spot: "Entrance Side Drain",
    description: "Drainage water is stagnating and causing odor near the entrance.",
    department: "Maintenance",
    status: "Pending",
    reporterEmail: "vignesh.m@student.baiet.edu",
    progress: 10,
    tone: "pending",
    ecoMember: "",
    assigneeContact: "",
  },
  {
    type: "Damaged Dustbin in Science Block",
    category: "Garbage Overflow",
    block: "SF",
    spot: "First Floor Lobby",
    description: "The dustbin lid is broken and litter is spilling onto the floor.",
    department: "Sanitation",
    status: "Resolved",
    reporterEmail: "keerthana.s@student.baiet.edu",
    progress: 100,
    tone: "success",
    ecoMember: "Mohana",
    assigneeContact: "+91 98765 11002",
  },
  {
    type: "Unclean Wash Area in Admin Block",
    category: "Plastic Waste",
    block: "IB",
    spot: "Wash Area Near Office",
    description: "Disposable cups and plates are not being cleared regularly.",
    department: "Sanitation",
    status: "In Progress",
    reporterEmail: "arun.prakash@student.baiet.edu",
    progress: 60,
    tone: "warning",
    ecoMember: "Ravi Kumar",
    assigneeContact: "+91 98765 11001",
  },
  {
    type: "Leaking Tap Near Seminar Hall",
    category: "Water Leakage",
    block: "AS",
    spot: "Seminar Hall Side",
    description: "Tap keeps leaking throughout the day causing water wastage.",
    department: "Plumber",
    status: "Resolved",
    reporterEmail: "nivetha.sri@student.baiet.edu",
    progress: 100,
    tone: "success",
    ecoMember: "Mani",
    assigneeContact: "+91 98765 33001",
  },
];

export const ensureAdminUser = async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@ecoportal.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const existing = await User.findOne({ email: adminEmail });
  if (existing) return;

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await User.create({
    name: "Admin",
    email: adminEmail,
    phone: "",
    passwordHash,
    role: "admin",
  });
  // eslint-disable-next-line no-console
  console.log(`Default admin created: ${adminEmail}`);
};

export const ensureDemoCampusData = async () => {
  const demoPasswordHash = await bcrypt.hash("student123", 10);

  for (const demoUser of demoUsers) {
    const existing = await User.findOne({ email: demoUser.email.toLowerCase() });
    if (existing) continue;

    await User.create({
      ...demoUser,
      email: demoUser.email.toLowerCase(),
      passwordHash: demoPasswordHash,
      role: "user",
    });
  }

  const existingDemoReports = await Report.countDocuments({
    reporterEmail: { $in: demoUsers.map((user) => user.email.toLowerCase()) },
  });

  await Report.updateMany(
    { block: { $exists: true } },
    [
      {
        $set: {
          latitude: {
            $switch: {
              branches: Object.entries(CAMPUS_BLOCK_COORDS).map(([block, coordinates]) => ({
                case: { $eq: ["$block", block] },
                then: coordinates.latitude,
              })),
              default: CAMPUS_BLOCK_COORDS.Others.latitude,
            },
          },
          longitude: {
            $switch: {
              branches: Object.entries(CAMPUS_BLOCK_COORDS).map(([block, coordinates]) => ({
                case: { $eq: ["$block", block] },
                then: coordinates.longitude,
              })),
              default: CAMPUS_BLOCK_COORDS.Others.longitude,
            },
          },
        },
      },
    ]
  );

  await Promise.all(
    demoReports.map((item) => {
      const coordinates = getCampusBlockCoords(item.block);
      return Report.updateOne(
        {
          type: item.type,
          block: item.block,
          reporterEmail: item.reporterEmail.toLowerCase(),
        },
        { $set: coordinates }
      );
    })
  );

  if (existingDemoReports >= demoReports.length) return;

  let currentCount = await Report.countDocuments();

  for (const item of demoReports) {
    const exists = await Report.findOne({
      reporterEmail: item.reporterEmail.toLowerCase(),
      type: item.type,
      block: item.block,
    });
    if (exists) continue;

    currentCount += 1;
    const now = new Date();
    const reportedAt = new Date(now.getTime() - currentCount * 86400000);
    const assignedAt = new Date(reportedAt.getTime() + 6 * 60 * 60 * 1000);
    const inProgressAt = new Date(reportedAt.getTime() + 18 * 60 * 60 * 1000);
    const resolvedAt = new Date(reportedAt.getTime() + 42 * 60 * 60 * 1000);
    const location = item.spot ? `${item.block} - ${item.spot}` : `${item.block} - General Area`;
    const coords = getCampusBlockCoords(item.block);

    const timeline = [
      { date: reportedAt.toLocaleString("en-IN"), text: "Reported" },
    ];

    const adminFlow = { reportedAt, assignedAt: null, inProgressAt: null, resolvedAt: null, reopenedAt: null };
    if (item.department && item.department !== "Unassigned") {
      adminFlow.assignedAt = assignedAt;
      timeline.push({ date: assignedAt.toLocaleString("en-IN"), text: `Assigned (${item.department})` });
    }
    if (item.status === "In Progress" || item.status === "Resolved") {
      adminFlow.inProgressAt = inProgressAt;
      timeline.push({ date: inProgressAt.toLocaleString("en-IN"), text: "In Progress" });
    }
    if (item.status === "Resolved") {
      adminFlow.resolvedAt = resolvedAt;
      timeline.push({ date: resolvedAt.toLocaleString("en-IN"), text: "Resolved" });
    }

    await Report.create({
      reportNumber: generateReportNumber(currentCount - 1),
      date: reportedAt.toISOString().slice(0, 10),
      type: item.type,
      category: item.category,
      status: item.status,
      progress: item.progress,
      tone: item.tone,
      location,
      block: item.block,
      latitude: coords.latitude,
      longitude: coords.longitude,
      assignedWorker: item.department,
      department: item.department,
      ecoMember: item.ecoMember,
      reporterId: "",
      reporterEmail: item.reporterEmail.toLowerCase(),
      contactInfo: item.reporterEmail.toLowerCase(),
      assigneeContact: item.assigneeContact,
      internalNotes: "",
      description: item.description,
      images: [{ src: "/backgroundimg.jpg", name: "campus-issue.jpg" }],
      adminFlow,
      timeline,
      createdAt: reportedAt,
      updatedAt: item.status === "Resolved" ? resolvedAt : item.status === "In Progress" ? inProgressAt : reportedAt,
    });
  }
};
