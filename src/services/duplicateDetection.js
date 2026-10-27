const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_GEMINI_ATTEMPTS = 3;

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const specificSpot = (report = {}) => {
  if (report.spot !== undefined && report.spot !== null) return String(report.spot).trim();
  const location = String(report.location || "");
  const separator = location.indexOf(" - ");
  return separator >= 0 ? location.slice(separator + 3).trim() : "";
};

const duplicateComparisonReport = (report) => ({
  reportNumber: String(report.reportNumber || ""),
  block: String(report.block || "").slice(0, 80),
  issueTitle: String(report.type || "").slice(0, 180),
  specificSpot: specificSpot(report).slice(0, 180),
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
  console.log("========== DUPLICATE DETECTION START ==========");
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  console.log("API Key exists:", !!apiKey);
  console.log("API Key length:", apiKey?.length || 0);
  console.log("Candidates:", candidates.length);
  if (!apiKey) {
    console.warn("[Duplicate Detection] Gemini skipped: GEMINI_API_KEY is not configured.");
    return fallbackResult();
  }
  if (!candidates.length) {
    console.info("[Duplicate Detection] Skipped: no unresolved reports in this block.");
    return fallbackResult();
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
  console.log("Calling Gemini with model:", model);
  const allowedReportNumbers = new Set(candidates.map((item) => String(item.reportNumber)));
  const systemPrompt = [
    "You check duplicate campus reports.",
    "Compare only block, issueTitle, specificSpot, and description. Do not use category, reporter, date, image, or coordinates.",
    "Mark isDuplicate true only when a candidate has the same block, issueTitle, specificSpot, and description as the submitted report.",
    "Keep the submitted specificSpot wording as supplied. Do not rewrite or infer a different spot.",
    "If any of block, issueTitle, specificSpot, or description differs, set isDuplicate to false.",
    "When there is a duplicate, use that candidate's reportNumber. Otherwise set isDuplicate to false.",
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
              submittedReport: duplicateComparisonReport(newReport),
              candidateReports: candidates.map(duplicateComparisonReport),
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
        console.log("Gemini Status:", response.status);
        if (!response.ok) {
          const retryable = response.status === 408 || response.status >= 500;
          const errorBody = await response.json().catch(() => ({}));
          const providerMessage = String(errorBody?.error?.message || "").slice(0, 280);
          const error = new Error(
            `Gemini request failed with status ${response.status}${providerMessage ? `: ${providerMessage}` : ""}`
          );
          error.retryable = retryable;
          throw error;
        }

        const body = await response.json();
        const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
        const result = normalResult(parseGeminiJson(text || ""));

        if (!result.isDuplicate) {
          console.info(`[Duplicate Detection] Gemini decision: normal | model=${model} | candidates=${candidates.length}`);
          return result;
        }

        if (allowedReportNumbers.has(result.duplicateReportNumber)) {
          console.info(
            `[Duplicate Detection] Gemini decision: duplicate | match=${result.duplicateReportNumber} | confidence=${result.confidence} | model=${model}`
          );
          return result;
        }

        console.warn("[Duplicate Detection] Gemini returned an invalid duplicate report number; using normal flow.");
        return fallbackResult();
      } catch (error) {
        const canRetry = (error.retryable || error instanceof TypeError) && attempt < MAX_GEMINI_ATTEMPTS - 1;
        if (!canRetry) throw error;
        await wait(500 * 2 ** attempt);
      }
    }
  } catch (error) {
    // Gemini quota and API errors use the normal report flow.
    console.warn("[Duplicate Detection] Gemini check failed; using normal flow:", error.message);
    return fallbackResult();
  }
};
