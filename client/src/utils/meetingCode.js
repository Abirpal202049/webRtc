/**
 * Meeting Code Utility
 *
 * Generates and validates meeting codes in Google Meet format: xxx-xxx-xxxx
 * (3-3-4 lowercase letters, 10 characters total).
 *
 * The meeting code IS the room ID on the signaling server — no separate
 * mapping or database needed. The code uniquely identifies a room.
 */

/**
 * Generate a random meeting code in the format abc-def-ghij.
 * Uses 26 lowercase letters, giving 26^10 ≈ 141 trillion possible codes.
 */
export function generateMeetingCode() {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6, 10)}`;
}

/**
 * Validate that a string is a properly formatted meeting code.
 */
export function isValidMeetingCode(code) {
  return /^[a-z]{3}-[a-z]{3}-[a-z]{4}$/.test(code);
}

/**
 * Attempt to format raw user input into a meeting code.
 * Strips non-alpha characters, lowercases, and inserts hyphens.
 * Returns the formatted string (may not be valid if too short).
 */
export function formatMeetingCode(raw) {
  const letters = raw.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10);
  if (letters.length <= 3) return letters;
  if (letters.length <= 6) return `${letters.slice(0, 3)}-${letters.slice(3)}`;
  return `${letters.slice(0, 3)}-${letters.slice(3, 6)}-${letters.slice(6)}`;
}
