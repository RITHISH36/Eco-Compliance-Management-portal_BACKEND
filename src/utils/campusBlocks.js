export const CAMPUS_BLOCKS = [
  "IB",
  "AS",
  "SF",
  "MECH",
  "CAFETARIA",
  "Ground",
  "Parking",
  "Girls Hostel",
  "Boys Hostel",
  "Others",
];

export const CAMPUS_BLOCK_COORDS = {
  IB: { latitude: 11.49534, longitude: 77.27663 },
  AS: { latitude: 11.49534, longitude: 77.27853 },
  SF: { latitude: 11.49569, longitude: 77.27998 },
  MECH: { latitude: 11.49473, longitude: 77.27998 },
  CAFETARIA: { latitude: 11.49234, longitude: 77.27855 },
  Ground: { latitude: 11.49142, longitude: 77.27842 },
  Parking: { latitude: 11.50054, longitude: 77.27998 },
  "Girls Hostel": { latitude: 11.49214, longitude: 77.27592 },
  "Boys Hostel": { latitude: 11.49297, longitude: 77.28078 },
  Others: { latitude: 11.4970, longitude: 77.2771 },
};

export const CAMPUS_BOUNDS = {
  north: 11.5022,
  south: 11.4908,
  east: 77.2820,
  west: 77.2738,
};

export const isWithinCampus = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= CAMPUS_BOUNDS.south
    && lat <= CAMPUS_BOUNDS.north
    && lng >= CAMPUS_BOUNDS.west
    && lng <= CAMPUS_BOUNDS.east;
};

export const normalizeCampusBlock = (value = "") => {
  const raw = String(value).trim().toLowerCase();
  if (!raw) return "Others";
  if (raw.includes("ib")) return "IB";
  if (raw.includes("academic") || raw === "as" || raw.includes("as block")) return "AS";
  if (raw.includes("sf")) return "SF";
  if (raw.includes("mech")) return "MECH";
  if (raw.includes("caf")) return "CAFETARIA";
  if (raw.includes("ground") || raw.includes("play")) return "Ground";
  if (raw.includes("parking")) return "Parking";
  if (raw.includes("girls")) return "Girls Hostel";
  if (raw.includes("boys")) return "Boys Hostel";
  if (raw.includes("other")) return "Others";
  return "Others";
};

export const getCampusBlockCoords = (block = "Others") =>
  CAMPUS_BLOCK_COORDS[normalizeCampusBlock(block)] || CAMPUS_BLOCK_COORDS.Others;
