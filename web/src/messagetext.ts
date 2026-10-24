/*
 * The "no links" check for messages (owner decision 2026-10-24: nothing that takes a buyer out of
 * FarmFlow; phone numbers are fine). The same pattern as firestore.rules hasLink() — the rules are what
 * enforce it; this copy gives the sender a clear reason. web/test/link-cases.json is a copy of
 * FarmFlow-App functions/messages/link-cases.json: keep the two in step.
 */
export const MAX_MESSAGE_LENGTH = 1000;

const LINK = /(https?:\/\/|www\.|\b(wa|t|m)\.me\b|\b[a-z0-9-]+\.(com|net|org|co|io|ly|app|link|info|biz|shop|store|site|online|xyz|gl|gg|uk|tt|jm|bb|lc|gd|vc|ag|ky|gy)\b|@[a-z_][a-z0-9_.]{2,})/;

export const hasLink = (text: string) => LINK.test(text.toLowerCase());

/** Why the text can't be sent, or null. */
export function linkProblem(text: string): string | null {
  if (!text.trim()) return 'Write a message first.';
  if (text.length > MAX_MESSAGE_LENGTH) return `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`;
  if (hasLink(text)) return "Links, email addresses and @usernames can't be sent in FarmFlow messages. Phone numbers are fine.";
  return null;
}
