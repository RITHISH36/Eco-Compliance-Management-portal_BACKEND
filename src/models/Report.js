import mongoose from "mongoose";
import { CAMPUS_BLOCKS } from "../utils/campusBlocks.js";

const timelineSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    src: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const adminFlowSchema = new mongoose.Schema(
  {
    reportedAt: { type: Date, default: null },
    assignedAt: { type: Date, default: null },
    inProgressAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    reopenedAt: { type: Date, default: null },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    reportNumber: { type: String, required: true, unique: true, index: true },
    date: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, default: "General" },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved", "Reopened"],
      default: "Pending",
    },
    progress: { type: Number, default: 10 },
    tone: { type: String, default: "pending" },
    location: { type: String, required: true },
    block: { type: String, enum: CAMPUS_BLOCKS, default: "Others" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    assignedWorker: { type: String, default: "Unassigned" },
    department: { type: String, default: "Unassigned" },
    ecoMember: { type: String, default: "" },
    reporterId: { type: String, default: "" },
    reporterEmail: { type: String, default: "" },
    contactInfo: { type: String, default: "" },
    assigneeContact: { type: String, default: "" },
    internalNotes: { type: String, default: "" },
    description: { type: String, default: "" },
    isSpam: { type: Boolean, default: false, index: true },
    duplicateOf: { type: String, default: "" },
    duplicateReason: { type: String, default: "" },
    duplicateConfidence: { type: Number, default: 0 },
    duplicateDetectionSource: { type: String, default: "fallback" },
    timeline: { type: [timelineSchema], default: [] },
    images: { type: [imageSchema], default: [] },
    adminFlow: { type: adminFlowSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
