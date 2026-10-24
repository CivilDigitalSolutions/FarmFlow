/*
 * In-app messaging on the web — the same chats as the Android app (MESSAGING_PLAN.md in FarmFlow-App):
 * conversations/{listingId}_{buyerUid} with a messages subcollection, users/{uid}/convState and
 * users/{uid}/blockedUsers, all under the same firestore.rules. The onMessageCreated function fills in
 * names, the listing snapshot and the preview, and sends the push.
 *
 * Chats are live, so this module uses the full Firestore SDK (listeners), not Firestore Lite. It is
 * imported only by the /messages pages; the header's unread badge uses unreadChatCount() in data.ts.
 */
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getFirestore, limit, limitToLast,
  onSnapshot, orderBy, query, serverTimestamp, setDoc, where, writeBatch,
  type DocumentSnapshot, type Timestamp,
} from 'firebase/firestore';
import { USE_EMULATORS, app } from './firebase.ts';
import { linkProblem } from './messagetext.ts';

const db = getFirestore(app);
if (USE_EMULATORS) {
  try { connectFirestoreEmulator(db, location.hostname, 8080); } catch { /* already connected */ }
}

export interface Conversation {
  id: string;
  listingId: string;
  buyerUid: string;
  sellerUid: string;
  listingTitle: string;
  listingImage: string | null;
  listingEmoji: string | null;
  buyerName: string;
  sellerName: string;
  buyerPhoto: string | null;
  sellerPhoto: string | null;
  lastText: string;
  lastSenderUid: string | null;
  lastMessageAt: number;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  text: string;
  createdAt: number;
  pending: boolean;
}

export interface ConversationState { readAt: number | null; muted: boolean }

export const conversationId = (listingId: string, buyerUid: string) => `${listingId}_${buyerUid}`;
export const splitConversationId = (id: string) => {
  const i = id.lastIndexOf('_');
  return { listingId: id.slice(0, i), buyerUid: id.slice(i + 1) };
};

const millis = (s: DocumentSnapshot, field: string): number =>
  (s.get(field, { serverTimestamps: 'estimate' }) as Timestamp | null | undefined)?.toMillis?.() ?? 0;

function toConversation(s: DocumentSnapshot): Conversation {
  const str = (f: string) => (typeof s.get(f) === 'string' ? (s.get(f) as string) : '');
  const opt = (f: string) => (typeof s.get(f) === 'string' ? (s.get(f) as string) : null);
  return {
    id: s.id,
    listingId: str('listingId'),
    buyerUid: str('buyerUid'),
    sellerUid: str('sellerUid'),
    listingTitle: str('listingTitle'),
    listingImage: opt('listingImage'),
    listingEmoji: opt('listingEmoji'),
    buyerName: str('buyerName'),
    sellerName: str('sellerName'),
    buyerPhoto: opt('buyerPhoto'),
    sellerPhoto: opt('sellerPhoto'),
    lastText: str('lastText'),
    lastSenderUid: opt('lastSenderUid'),
    lastMessageAt: millis(s, 'lastMessageAt'),
  };
}

export const otherUid = (c: Conversation, me: string) => (me === c.sellerUid ? c.buyerUid : c.sellerUid);
export const otherName = (c: Conversation, me: string) =>
  (me === c.sellerUid ? c.buyerName : c.sellerName) || 'FarmFlow user';
export const otherPhoto = (c: Conversation, me: string) => (me === c.sellerUid ? c.buyerPhoto : c.sellerPhoto);
export const isUnread = (c: Conversation, me: string, st?: ConversationState) =>
  !!c.lastSenderUid && c.lastSenderUid !== me && c.lastMessageAt > (st?.readAt ?? 0);

type Off = () => void;

export function watchConversations(uid: string, cb: (c: Conversation[]) => void): Off {
  return onSnapshot(
    query(collection(db, 'conversations'), where('participants', 'array-contains', uid), orderBy('lastMessageAt', 'desc'), limit(200)),
    (snap) => cb(snap.docs.map(toConversation)),
    () => undefined,
  );
}

/** null until the chat exists (a buyer before the first message, whose read is refused). */
export function watchConversation(id: string, cb: (c: Conversation | null) => void): Off {
  return onSnapshot(doc(db, 'conversations', id), (s) => cb(s.exists() ? toConversation(s) : null), () => cb(null));
}

export function watchMessages(id: string, cb: (m: ChatMessage[]) => void): Off {
  return onSnapshot(
    query(collection(db, 'conversations', id, 'messages'), orderBy('createdAt', 'asc'), limitToLast(500)),
    { includeMetadataChanges: true },
    (snap) => cb(snap.docs.map((d) => ({
      id: d.id,
      senderUid: (d.get('senderUid') as string) ?? '',
      text: (d.get('text') as string) ?? '',
      createdAt: millis(d, 'createdAt') || Date.now(),
      pending: d.metadata.hasPendingWrites,
    }))),
    () => cb([]),
  );
}

export function watchStates(uid: string, cb: (s: Record<string, ConversationState>) => void): Off {
  return onSnapshot(collection(db, 'users', uid, 'convState'), (snap) => {
    const out: Record<string, ConversationState> = {};
    snap.docs.forEach((d) => { out[d.id] = { readAt: millis(d, 'readAt') || null, muted: d.get('muted') === true }; });
    cb(out);
  }, () => undefined);
}

export function watchBlocked(uid: string, cb: (s: Set<string>) => void): Off {
  return onSnapshot(collection(db, 'users', uid, 'blockedUsers'), (snap) => cb(new Set(snap.docs.map((d) => d.id))), () => undefined);
}

/** Who owns a listing (the seller a new chat goes to) and whether it's still on sale. Signed-in read. */
export async function listingOwner(listingId: string): Promise<{ ownerUid: string; active: boolean } | null> {
  const s = await getDoc(doc(db, 'listings', listingId)).catch(() => null);
  if (!s?.exists()) return null;
  return { ownerUid: (s.get('ownerUid') as string) || (s.get('sellerId') as string) || '', active: s.get('status') === 'ACTIVE' };
}

export class SendError extends Error {}

/** Sends a message; the buyer's first message opens the chat in the same batch. */
export async function sendMessage(me: string, listingId: string, buyerUid: string, sellerUid: string, raw: string): Promise<void> {
  const text = raw.trim();
  const problem = linkProblem(text);
  if (problem) throw new SendError(problem);
  const convRef = doc(db, 'conversations', conversationId(listingId, buyerUid));
  const message = { senderUid: me, text, createdAt: serverTimestamp() };
  try {
    const exists = (await getDoc(convRef)).exists();
    if (exists) {
      await addDoc(collection(convRef, 'messages'), message);
    } else {
      const batch = writeBatch(db);
      batch.set(convRef, {
        listingId, buyerUid, sellerUid, participants: [buyerUid, sellerUid],
        createdAt: serverTimestamp(), lastMessageAt: serverTimestamp(),
      });
      batch.set(doc(collection(convRef, 'messages')), message);
      await batch.commit();
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new SendError(code === 'permission-denied'
      ? "This message couldn't be sent. The listing may be sold or removed, or this person isn't taking messages."
      : code === 'unavailable' ? "You're offline. Check your connection and try again." : "This message couldn't be sent. Please try again.");
  }
}

export const deleteMessage = (convId: string, messageId: string) =>
  deleteDoc(doc(db, 'conversations', convId, 'messages', messageId));

export const markRead = (uid: string, convId: string) =>
  setDoc(doc(db, 'users', uid, 'convState', convId), { readAt: serverTimestamp() }, { merge: true }).catch(() => undefined);

export const setMuted = (uid: string, convId: string, muted: boolean) =>
  setDoc(doc(db, 'users', uid, 'convState', convId), { muted }, { merge: true });

export const setBlocked = (uid: string, other: string, blocked: boolean) => {
  const ref = doc(db, 'users', uid, 'blockedUsers', other);
  return blocked ? setDoc(ref, { blockedAt: serverTimestamp() }) : deleteDoc(ref);
};

export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'SCAM', label: 'Scam or fraud' },
  { value: 'HARASSMENT', label: 'Harassment or abuse' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'PROHIBITED_ITEM', label: 'Selling something prohibited' },
  { value: 'OTHER', label: 'Something else' },
];

export const reportMessage = (me: string, convId: string, messageId: string, reason: string, details: string) =>
  addDoc(collection(db, 'messageReports'), {
    reporterUid: me, conversationId: convId, messageId, reason, details: details.trim().slice(0, 1000),
    status: 'OPEN', createdAt: serverTimestamp(),
  });
