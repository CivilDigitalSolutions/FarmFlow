import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Page, ProfileRetry, Spinner } from '../components.tsx';
import { navigate, type Location } from '../router.ts';
import { useSession } from '../session.ts';
import { MAX_MESSAGE_LENGTH, linkProblem } from '../messagetext.ts';
import { fetchListing } from '../api.ts';
import type { ChatMessage, Conversation, ConversationState } from '../messages.ts';
import type { PublicListing } from '../types.ts';
import { useRequireSignIn } from './Account.tsx';

type Msgs = typeof import('../messages.ts');
let msgsPromise: Promise<Msgs> | null = null;
const messagesModule = () => (msgsPromise ??= import('../messages.ts'));

function useMessages(): Msgs | null {
  const [m, setM] = useState<Msgs | null>(null);
  useEffect(() => { messagesModule().then(setM).catch(() => undefined); }, []);
  return m;
}

/** /messages, /messages/{listingId}_{buyerUid}, and /messages/new?listing={id} (from "Message seller"). */
export function MessagesRoute({ loc }: { loc: Location }) {
  const session = useSession();
  const target = loc.path.replace(/^\/messages\/?/, '').replace(/\/$/, '');
  const loading = useRequireSignIn(loc.path + (loc.search.toString() ? `?${loc.search}` : ''));

  useEffect(() => {
    if (target === 'new' && session.status === 'signedIn') {
      const listing = loc.search.get('listing');
      navigate(listing ? `/messages/${listing}_${session.uid}` : '/messages', { replace: true });
    }
  }, [target, session.status]);

  if (session.status === 'signedIn' && session.profileError) return <Page><ProfileRetry /></Page>;
  if (loading || session.status !== 'signedIn' || target === 'new') return <Page><Spinner /></Page>;
  return target
    ? <Chat key={target} uid={session.uid} convId={decodeURIComponent(target)} />
    : <ChatList uid={session.uid} isSeller={!!session.profile?.isSeller} />;
}

function relative(ms: number): string {
  if (!ms) return '';
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  if (min < 2880) return 'Yesterday';
  if (min < 10080) return `${Math.floor(min / 1440)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url
    ? <img class="chat-avatar" src={url} alt="" />
    : <span class="chat-avatar stall-initial" aria-hidden="true">{(name || '?').charAt(0)}</span>;
}

function ChatList({ uid, isSeller }: { uid: string; isSeller: boolean }) {
  const m = useMessages();
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [states, setStates] = useState<Record<string, ConversationState>>({});
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  useEffect(() => { document.title = 'Messages | FarmFlow'; }, []);
  useEffect(() => {
    if (!m) return;
    const offs = [m.watchConversations(uid, setConvs), m.watchStates(uid, setStates), m.watchBlocked(uid, setBlocked)];
    return () => offs.forEach((off) => off());
  }, [m, uid]);

  if (!m || convs == null) return <Page class="messages"><h1>Messages</h1><Spinner /></Page>;
  const ordered = [...convs].sort((a, b) => Number(blocked.has(m.otherUid(a, uid))) - Number(blocked.has(m.otherUid(b, uid))));
  return (
    <Page class="messages">
      <h1>Messages</h1>
      {ordered.length === 0 ? (
        <p class="empty">
          {isSeller ? 'No messages yet. When a buyer messages you about a listing, it appears here.'
            : 'No messages yet. Tap “Message seller” on a listing to ask about it.'}
        </p>
      ) : (
        <ul class="chat-list">
          {ordered.map((c) => {
            const other = m.otherUid(c, uid);
            const isBlocked = blocked.has(other);
            const unread = !isBlocked && m.isUnread(c, uid, states[c.id]);
            const others = convs.filter((x) => x.id !== c.id && m.otherUid(x, uid) === other).length;
            const preview = isBlocked ? 'Blocked' : !c.lastText ? 'Message deleted'
              : c.lastSenderUid === uid ? `You: ${c.lastText}` : c.lastText;
            return (
              <li key={c.id} class={unread ? 'unread' : ''}>
                <a href={`/messages/${c.id}`}>
                  <Avatar url={m.otherPhoto(c, uid)} name={m.otherName(c, uid)} />
                  <span class="chat-row">
                    <span class="chat-top">
                      <strong>{m.otherName(c, uid)}</strong>
                      {states[c.id]?.muted && <span class="muted-tag" title="Muted">🔕</span>}
                      <time>{relative(c.lastMessageAt)}</time>
                    </span>
                    <span class="chat-listing">
                      {c.listingTitle || 'Listing'}{others > 0 && ` · +${others} other chat${others === 1 ? '' : 's'}`}
                    </span>
                    <span class="chat-preview">{preview}{unread && <span class="dot" aria-label="Unread" />}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function Chat({ uid, convId }: { uid: string; convId: string }) {
  const m = useMessages();
  const { listingId, buyerUid } = useMemo(() => {
    const i = convId.lastIndexOf('_');
    return { listingId: convId.slice(0, i), buyerUid: convId.slice(i + 1) };
  }, [convId]);
  const [conv, setConv] = useState<Conversation | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [states, setStates] = useState<Record<string, ConversationState>>({});
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [allChats, setAllChats] = useState<Conversation[]>([]);
  const [listing, setListing] = useState<PublicListing | null | undefined>(undefined);
  const [owner, setOwner] = useState<{ ownerUid: string; active: boolean } | null | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const readAtOnOpen = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!m) return;
    const offs = [
      m.watchConversation(convId, setConv),
      m.watchStates(uid, (s) => { if (readAtOnOpen.current == null) readAtOnOpen.current = s[convId]?.readAt ?? 0; setStates(s); }),
      m.watchBlocked(uid, setBlocked),
      m.watchConversations(uid, setAllChats),
    ];
    m.listingOwner(listingId).then(setOwner);
    return () => offs.forEach((off) => off());
  }, [m, convId]);
  // Messages only once the chat exists: before the buyer's first message the read is refused, and
  // Firestore ends a listener for good after an error.
  const chatExists = conv != null;
  useEffect(() => {
    if (!m || !chatExists) return;
    return m.watchMessages(convId, setMessages);
  }, [m, convId, chatExists]);
  useEffect(() => { fetchListing(listingId).then((d) => setListing(d.listing)).catch(() => setListing(null)); }, [listingId]);

  // Mark read while the chat is open and visible; scroll to the newest message.
  useEffect(() => {
    if (!m || !conv || !messages.length) return;
    if (document.visibilityState === 'visible') m.markRead(uid, convId);
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [m, conv != null, messages.length]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && m && conv) m.markRead(uid, convId); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [m, conv != null]);

  const sellerUid = conv?.sellerUid ?? owner?.ownerUid ?? '';
  const other = uid === sellerUid ? buyerUid : sellerUid;
  const name = conv ? (m ? m.otherName(conv, uid) : '') : 'the seller';
  useEffect(() => { document.title = `${conv ? name : 'Message seller'} | FarmFlow`; }, [name]);

  if (!m || conv === undefined || owner === undefined) return <Page class="messages"><Spinner /></Page>;
  // Someone else's chat id typed into the address bar: the rules refuse it, so say so plainly.
  if (!conv && buyerUid !== uid) return <Page class="messages"><p class="empty">This chat isn't available.</p><p><a href="/messages">Back to messages</a></p></Page>;
  if (!conv && owner?.ownerUid === uid) return <Page class="messages"><p class="empty">This is your own listing.</p></Page>;

  const iBlocked = blocked.has(other);
  const muted = states[convId]?.muted === true;
  const gone = !listing || !owner?.active;
  const canSend = !iBlocked && !!sellerUid && (conv != null || !gone);
  const otherChats = conv ? allChats.filter((c) => c.id !== conv.id && m.otherUid(c, uid) === m.otherUid(conv, uid)) : [];
  const readAt = readAtOnOpen.current ?? 0;
  const firstUnread = readAt > 0 ? messages.find((x) => x.senderUid !== uid && x.createdAt > readAt)?.id : undefined;
  const unreadCount = messages.filter((x) => x.senderUid !== uid && x.createdAt > readAt).length;

  const send = async (e: Event) => {
    e.preventDefault();
    const text = draft;
    const problem = linkProblem(text.trim());
    if (problem) { setError(problem); return; }
    setSending(true);
    setDraft('');
    setError(null);
    try {
      await m.sendMessage(uid, listingId, buyerUid, sellerUid, text);
    } catch (err) {
      setError((err as Error).message);
      setDraft((d) => d || text);
    } finally {
      setSending(false);
    }
  };

  const image = listing?.images[0]?.thumbnailUrl ?? listing?.images[0]?.imageUrl ?? conv?.listingImage ?? null;
  return (
    <Page class="messages chat">
      <div class="chat-head">
        <a class="back" href="/messages" aria-label="Back to messages">‹</a>
        {conv && <Avatar url={m.otherPhoto(conv, uid)} name={name} />}
        <div class="chat-who">
          <strong>{conv ? name : 'Message seller'}</strong>
          {otherChats.length > 0 && (
            <details class="other-chats">
              <summary>{otherChats.length} other chat{otherChats.length === 1 ? '' : 's'} with {name}</summary>
              <ul>{otherChats.map((c) => <li key={c.id}><a href={`/messages/${c.id}`}>{c.listingTitle || 'Listing'}</a></li>)}</ul>
            </details>
          )}
        </div>
        {conv && (
          <div class="chat-menu">
            <button type="button" class="btn btn-ghost btn-small" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
            {menu && (
              <div class="menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); m.setMuted(uid, convId, !muted); }}>
                  {muted ? 'Unmute notifications' : 'Mute notifications'}
                </button>
                <button type="button" role="menuitem" onClick={() => {
                  setMenu(false);
                  if (iBlocked) m.setBlocked(uid, other, false);
                  else if (confirm(`Block ${name}? They won't be able to message you or start new chats with you.`)) m.setBlocked(uid, other, true);
                }}>{iBlocked ? `Unblock ${name}` : `Block ${name}`}</button>
                {messages.some((x) => x.senderUid !== uid) && (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setReporting([...messages].reverse().find((x) => x.senderUid !== uid) ?? null); }}>
                    Report this chat
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <a class={`chat-listing-card${listing ? '' : ' disabled'}`} href={listing ? listing.path : undefined}>
        {image ? <img src={image} alt="" /> : <span class="emoji" aria-hidden="true">{listing?.emoji ?? conv?.listingEmoji ?? '🧺'}</span>}
        <span>
          <strong>{listing?.title ?? conv?.listingTitle ?? 'Listing'}</strong>
          <small>{listing && !gone ? listing.priceLabel : 'No longer available'}</small>
        </span>
      </a>

      <div class="chat-body" aria-live="polite">
        <p class="safety-note">Keep chats on FarmFlow. Links can't be sent. Never pay before you've seen the produce.</p>
        {messages.length === 0 && <p class="empty">{conv ? 'No messages.' : `Ask ${name} about this listing.`}</p>}
        {messages.map((x, i) => {
          const prev = messages[i - 1];
          const mine = x.senderUid === uid;
          return (
            <div key={x.id}>
              {(!prev || new Date(prev.createdAt).toDateString() !== new Date(x.createdAt).toDateString()) &&
                <p class="day">{dayLabel(x.createdAt)}</p>}
              {x.id === firstUnread && <p class="unread-line">{unreadCount} unread message{unreadCount === 1 ? '' : 's'}</p>}
              <div class={`bubble ${mine ? 'mine' : 'theirs'}`}>
                <p>{x.text}</p>
                <span class="meta">
                  {new Date(x.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  {mine && x.pending && ' · sending'}
                  {mine ? (
                    <button type="button" class="link" onClick={() => {
                      if (confirm('Delete this message for both of you?')) m.deleteMessage(convId, x.id).catch(() => alert("Couldn't delete that message."));
                    }}>Delete</button>
                  ) : (
                    <button type="button" class="link" onClick={() => setReporting(x)}>Report</button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {iBlocked ? (
        <p class="hint">You blocked {name}. Unblock them from the ⋯ menu to send messages.</p>
      ) : !canSend ? (
        <p class="hint">This listing is no longer available, so a new chat can't be started.</p>
      ) : (
        <form class="composer" onSubmit={send}>
          {error && <p class="error" role="alert">{error}</p>}
          <textarea
            aria-label="Message"
            placeholder="Message"
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            value={draft}
            onInput={(e) => { setDraft((e.target as HTMLTextAreaElement).value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(e); } }}
          />
          {draft.length > MAX_MESSAGE_LENGTH - 200 && <small class="counter">{draft.length} / {MAX_MESSAGE_LENGTH}</small>}
          <button type="submit" class="btn btn-primary" disabled={!draft.trim() || sending}>Send</button>
        </form>
      )}

      {reporting && <ReportDialog onClose={() => setReporting(null)} onSubmit={async (reason, details) => {
        const target = reporting;
        setReporting(null);
        try {
          await m.reportMessage(uid, convId, target.id, reason, details);
          alert('Thanks. A FarmFlow moderator will review it.');
        } catch {
          alert("Couldn't send the report. Try again.");
        }
      }} reasons={m.REPORT_REASONS} />}
    </Page>
  );
}

function ReportDialog({ onClose, onSubmit, reasons }: {
  onClose: () => void;
  onSubmit: (reason: string, details: string) => void;
  reasons: { value: string; label: string }[];
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  return (
    <div class="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form class="dialog" role="dialog" aria-labelledby="report-title" onSubmit={(e) => { e.preventDefault(); if (reason) onSubmit(reason, details); }}>
        <h2 id="report-title">Report message</h2>
        <p>A FarmFlow moderator will see this message and the ones before it.</p>
        {reasons.map((r) => (
          <label key={r.value} class="radio">
            <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} /> {r.label}
          </label>
        ))}
        <label>Anything else (optional)
          <textarea rows={3} maxLength={500} value={details} onInput={(e) => setDetails((e.target as HTMLTextAreaElement).value)} />
        </label>
        <p class="row">
          <button type="button" class="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={!reason}>Send report</button>
        </p>
      </form>
    </div>
  );
}
