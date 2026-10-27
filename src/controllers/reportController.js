import Report from "../models/Report.js";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import { getCampusBlockCoords, isWithinCampus, normalizeCampusBlock } from "../utils/campusBlocks.js";
import { generateReportNumber } from "../utils/reportNumber.js";
import User from "../models/User.js";
import { detectDuplicateReport } from "../services/duplicateDetection.js";

const nowISO = () => new Date().toISOString();
const dateLabel = () => new Date().toISOString().slice(0, 10);

const buildTimeline = (report) => {
  const flow = report.adminFlow || {};
  const timeline = [
    {
      date: new Date(flow.reportedAt || report.createdAt || nowISO()).toLocaleString("en-IN"),
      text: "Reported",
    },
  ];

  if (flow.assignedAt) {
    timeline.push({
      date: new Date(flow.assignedAt).toLocaleString("en-IN"),
      text: `Assigned (${report.department || "Unassigned"})`,
    });
  }
  if (flow.inProgressAt) {
    timeline.push({
      date: new Date(flow.inProgressAt).toLocaleString("en-IN"),
      text: "In Progress",
    });
  }
  if (flow.resolvedAt && report.status === "Resolved") {
    timeline.push({
      date: new Date(flow.resolvedAt).toLocaleString("en-IN"),
      text: "Resolved",
    });
  }
  if (flow.reopenedAt && report.status === "Reopened") {
    timeline.push({
      date: new Date(flow.reopenedAt).toLocaleString("en-IN"),
      text: "Reopened",
    });
  }
  return timeline;
};

const toneFor = (status) =>
  status === "Resolved" ? "success" : status === "In Progress" ? "warning" : "pending";

const progressFor = (status, previous = 10) => {
  if (status === "Resolved") return 100;
  if (status === "In Progress") {
    const safePrevious = Number.isFinite(previous) ? previous : 10;
    return Math.min(Math.max(safePrevious, 45), 90);
  }
  if (status === "Reopened") return 20;
  return 10;
};

const uploadReportImages = async (images = []) => {
  const uploaded = [];

  for (const image of images) {
    if (!image?.src) continue;

    const src = String(image.src);
    const normalizedImage = {
      src,
      name: image.name || "report-image.jpg",
    };

    if (!src.startsWith("data:image")) {
      uploaded.push(normalizedImage);
      continue;
    }

    if (!isCloudinaryConfigured) {
      uploaded.push(normalizedImage);
      continue;
    }

    try {
      const result = await cloudinary.uploader.upload(src, {
        folder: "eco-compliance/reports",
        resource_type: "image",
        timeout: 120000,
      });

      uploaded.push({
        src: result.secure_url,
        name: normalizedImage.name,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Cloudinary upload skipped, using inline image instead.", error?.message || error);
      uploaded.push(normalizedImage);
    }
  }

  return uploaded;
};

export const getReports = async (req, res) => {
  const { status, category, block, q } = req.query;
  const filter = { isSpam: { $ne: true } };
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (block) filter.block = normalizeCampusBlock(block);
  if (q) {
    filter.$or = [
      { reportNumber: new RegExp(q, "i") },
      { type: new RegExp(q, "i") },
      { location: new RegExp(q, "i") },
    ];
  }
  const reports = await Report.find(filter).sort({ createdAt: -1 });
  return res.json(reports);
};

export const getSpamReports = async (_req, res) => {
  const reports = await Report.find({ isSpam: true }).sort({ createdAt: -1 });
  return res.json(reports);
};

export const getPublicDashboardStats = async (_req, res) => {
  const [totalReports, resolvedReports, activeUsers] = await Promise.all([
    Report.countDocuments({ isSpam: { $ne: true } }),
    Report.countDocuments({ status: "Resolved", isSpam: { $ne: true } }),
    User.countDocuments({ role: "user", disabled: false }),
  ]);

  return res.json({
    totalReports,
    resolvedReports,
    activeUsers,
  });
};

export const getMyReports = async (req, res) => {
  const email = String(req.user?.email || "").trim().toLowerCase();
  const userId = String(req.user?._id || "").trim();
  if (!email && !userId) return res.json([]);

  const filters = [];
  if (userId) {
    filters.push({ reporterId: userId });
  }
  if (email) {
    filters.push(
      { reporterEmail: new RegExp(`^${email}$`, "i") },
      { contactInfo: new RegExp(`^${email}$`, "i") }
    );
  }

  const reports = await Report.find({
    isSpam: { $ne: true },
    $or: filters,
  }).sort({ createdAt: -1 });

  return res.json(reports);
};

export const createReport = async (req, res) => {
  try {
    const {
      type,
      description,
      block,
      spot,
      category,
      images = [],
      reporterId = "",
      reporterEmail = "",
      contactInfo = "",
      assigneeContact = "",
      ecoMember = "",
      latitude = null,
      longitude = null,
    } = req.body;
    if (!type || !description || !block) {
      return res.status(400).json({ message: "type, description and block are required" });
    }

    const count = await Report.countDocuments();
    const reportNumber = generateReportNumber(count);
    const normalizedBlock = normalizeCampusBlock(block);
    const blockCoords = getCampusBlockCoords(normalizedBlock);
    const location = spot ? `${normalizedBlock} - ${spot}` : `${normalizedBlock} - General Area`;
    const reportedAt = nowISO();
    const duplicateCandidates = await Report.find({
      block: normalizedBlock,
      status: { $ne: "Resolved" },
      isSpam: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    console.info(
      `[Duplicate Detection] Candidate scan: block=${normalizedBlock} | location=${location} | candidates=${duplicateCandidates.length}`
    );
    const duplicateCheck = await detectDuplicateReport(
      {
        type,
        category: category || type,
        location,
        description,
      },
      duplicateCandidates
    );
    const uploadedImages = await uploadReportImages(images);

    const report = await Report.create({
      reportNumber,
      date: dateLabel(),
      type,
      category: category || type,
      status: "Pending",
      progress: 10,
      tone: "pending",
      location,
      block: normalizedBlock,
      latitude: isWithinCampus(latitude, longitude) ? latitude : blockCoords.latitude,
      longitude: isWithinCampus(latitude, longitude) ? longitude : blockCoords.longitude,
      assignedWorker: "Unassigned",
      department: "Unassigned",
      ecoMember,
      reporterId,
      reporterEmail: String(reporterEmail || contactInfo || "").trim().toLowerCase(),
      contactInfo: String(contactInfo || "").trim(),
      assigneeContact: String(assigneeContact || "").trim(),
      internalNotes: "",
      description,
      isSpam: duplicateCheck.isDuplicate,
      duplicateOf: duplicateCheck.duplicateReportNumber,
      duplicateReason: duplicateCheck.reason,
      duplicateConfidence: duplicateCheck.confidence,
      duplicateDetectionSource: duplicateCheck.source,
      images: uploadedImages.length
        ? uploadedImages
        : [{ src: "/backgroundimg.jpg", name: "no-image.jpg" }],
      adminFlow: { reportedAt },
      timeline: [{ date: new Date(reportedAt).toLocaleString("en-IN"), text: "Reported" }],
    });

    return res.status(201).json(report);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to create report", error);
    return res.status(500).json({
      message: error?.message || "Failed to create report",
    });
  }
};

export const updateReportStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const valid = ["Pending", "In Progress", "Resolved", "Reopened"];
  if (!valid.includes(status)) return res.status(400).json({ message: "Invalid status" });

  const report = await Report.findOne({ reportNumber: id, isSpam: { $ne: true } });
  if (!report) return res.status(404).json({ message: "Report not found" });

  const flow = report.adminFlow || {};
  const now = new Date();
  if (status === "In Progress" && !flow.inProgressAt) flow.inProgressAt = now;
  if (status === "Resolved") {
    if (!flow.inProgressAt) flow.inProgressAt = now;
    flow.resolvedAt = now;
    flow.reopenedAt = null;
  }
  if (status === "Reopened") {
    flow.reopenedAt = now;
    flow.resolvedAt = null;
    if (!flow.inProgressAt) flow.inProgressAt = now;
  }

  report.status = status;
  report.tone = toneFor(status);
  report.progress = progressFor(status, report.progress);
  report.adminFlow = flow;
  report.timeline = buildTimeline(report);
  await report.save();
  return res.json(report);
};

export const updateReportMeta = async (req, res) => {
  const { id } = req.params;
  const { department, ecoMember, contactInfo, assigneeContact, internalNotes } = req.body;
  const report = await Report.findOne({ reportNumber: id, isSpam: { $ne: true } });
  if (!report) return res.status(404).json({ message: "Report not found" });

  const flow = report.adminFlow || {};
  if (department && department !== report.department && department !== "Unassigned" && !flow.assignedAt) {
    flow.assignedAt = new Date();
  }
  if (department) {
    report.department = department;
    report.assignedWorker = department;
  }
  if (ecoMember !== undefined) report.ecoMember = ecoMember;
  if (contactInfo !== undefined) report.contactInfo = contactInfo;
  if (assigneeContact !== undefined) report.assigneeContact = assigneeContact;
  if (internalNotes !== undefined) report.internalNotes = internalNotes;

  report.adminFlow = flow;
  report.timeline = buildTimeline(report);
  await report.save();
  return res.json(report);
};

export const addInternalNote = async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  if (!note || !String(note).trim()) return res.status(400).json({ message: "note is required" });

  const report = await Report.findOne({ reportNumber: id, isSpam: { $ne: true } });
  if (!report) return res.status(404).json({ message: "Report not found" });
  const prefix = `[${new Date().toLocaleString("en-IN")}] `;
  report.internalNotes = `${report.internalNotes || ""}\n${prefix}${note}`.trim();
  await report.save();
  return res.json(report);
};
