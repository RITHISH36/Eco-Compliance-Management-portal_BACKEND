import User from "../models/User.js";
import Report from "../models/Report.js";

export const getUsers = async (req, res) => {
  const users = await User.find({ role: "user" }).select("-passwordHash");
  const reports = await Report.find(
    { isSpam: { $ne: true } },
    "reporterEmail contactInfo"
  );
  const reportByEmail = reports.reduce((acc, item) => {
    const key = String(item.reporterEmail || item.contactInfo || "").toLowerCase().trim();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const output = users.map((user) => ({
    id: user._id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    disabled: user.disabled,
    volunteer: user.volunteer,
    reportCount: reportByEmail[user.email.toLowerCase()] || 0,
  }));

  return res.json(output);
};

export const toggleDisabled = async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user || user.role !== "user") return res.status(404).json({ message: "User not found" });
  user.disabled = !user.disabled;
  await user.save();
  return res.json({ id: user._id, disabled: user.disabled });
};

export const toggleVolunteer = async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user || user.role !== "user") return res.status(404).json({ message: "User not found" });
  user.volunteer = !user.volunteer;
  await user.save();
  return res.json({ id: user._id, volunteer: user.volunteer });
};
