export interface ParsedViolation {
  tag: string;
  region: string;
  confidence: string;
  approved: string[];
}

// The backend writes reasons as one fixed sentence (see
// services/violations.py); pulling the fields back out lets the UI show
// pills instead of prose. Anything that doesn't match is shown verbatim.
export function parseViolationReason(reason: string): ParsedViolation | null {
  const m = reason.match(/tagged '([^']+)' accessed from region=(\S+) \(confidence=(\w+)\); approved regions: (.+)$/);
  if (!m) return null;
  return {
    tag: m[1],
    region: m[2],
    confidence: m[3],
    approved: m[4]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
