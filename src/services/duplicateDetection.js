const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_GEMINI_ATTEMPTS = 3;

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const normalReport = (report) => ({
  reportNumber: String(report.reportNumber || ""),
  type: String(report.type || "").slice(0, 180),
  category: String(report.category || "").slice(0, 120),
  location: String(report.location || "").slice(0, 180),
  description: String(report.description || "").slice(0, 700),
});

const normalResult = (result = {}) => ({
  isDuplicate: result.isDuplicate === true,
  duplicateReportNumber: String(result.duplicateReportNumber || ""),
  reason: String(result.reason || "").slice(0, 280),
  confidence: Math.min(Math.max(Number(result.confidence) || 0, 0), 1),
  source: "gemini",
});

const fallbackResult = () => ({
  isDuplicate: false,
  duplicateReportNumber: "",
  reason: "",
  confidence: 0,
  source: "fallback",
});

const parseGeminiJson = (text) => {
  const firstBrace = text.indexOf("{");
  if (firstBrace < 0) {
    throw new Error("Gemini did not return a JSON decision");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = firstBrace; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(firstBrace, index + 1));
    }
  }

  throw new Error("Gemini returned incomplete JSON");
};

export const detectDuplicateReport = async (newReport, candidates = []) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !candidates.length) return fallbackResult();

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
  const allowedReportNumbers = new Set(candidates.map((item) => String(item.reportNumber)));
  const systemPrompt = [
    "You detect repeated campus maintenance reports.",
    "Mark a report as a duplicate only when it is for the exact same campus location and the same unresolved physical issue as one candidate report.",
    "The descriptions may use different words, but they must clearly describe the same problem. Exact repeated descriptions are duplicates.",
    "A report from a different spot in the same block is not a duplicate. A matching category alone is not a duplicate.",
    "A report for an issue that was resolved is not a duplicate because it may be a new occurrence.",
    "When there is a clear match, choose the matching candidate report number. Otherwise set isDuplicate to false.",
    "Do not use or infer reporter identity. Compare only the supplied report details.",
    "Return JSON only with: isDuplicate (boolean), duplicateReportNumber (string), reason (string, maximum 120 characters), confidence (number from 0 to 1).",
    "Set isDuplicate to false when there is no clear match.",
  ].join(" ");

  const requestBody = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              submittedReport: normalReport(newReport),
              candidateReports: candidates.map(normalReport),
            }),
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 320,
    },
  };

  try {
    for (let attempt = 0; attempt < MAX_GEMINI_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const retryable = response.status === 408 || response.status >= 500;
          const error = new Error(`Gemini request failed with status ${response.status}`);
          error.retryable = retryable;
          throw error;
        }

        const body = await response.json();
        const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
        const result = normalResult(parseGeminiJson(text || ""));

        if (!result.isDuplicate) return result;
        return allowedReportNumbers.has(result.duplicateReportNumber) ? result : fallbackResult();
      } catch (error) {
        const canRetry = (error.retryable || error instanceof TypeError) && attempt < MAX_GEMINI_ATTEMPTS - 1;
        if (!canRetry) throw error;
        await wait(500 * 2 ** attempt);
      }
    }
  } catch (error) {
    // Gemini quota and API errors use the normal report flow.
    console.warn("Gemini duplicate check skipped:", error.message);
    return fallbackResult();
  }
};
