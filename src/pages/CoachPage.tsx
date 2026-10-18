import { ArrowUp, Bot, HeartPulse, Sparkles, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CoachNotice, CoachSuggestions } from '../components/coach';
import { RichText } from '../components/RichText';
import { ConfirmDialog, cx, IconButton, PageHeader, Sheet, TypingDots } from '../components/ui';
import { addChatMessage, clearChat } from '../db/repo';
import { loadCoachContext, useCoachAvailability, useCoachRequest } from '../hooks/useCoach';
import { useChat, useProgram, useSettings } from '../hooks/useData';
import { CoachError, streamCoach } from '../lib/coachClient';
import { LIMITS } from '../../shared/coach';

const QUICK = ['Why am I stuck on bench?', 'Plan a 4-week strength block', 'Should I train if I’m sore?', 'Should I run a strength or muscle block next?', 'How do I do a top set + back-off sets?'];

export function CoachPage() {
  const settings = useSettings();
  const program = useProgram();
  const chat = useChat();
  const availability = useCoachAvailability();
  const req = useCoachRequest();
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ready = availability.state === 'ready';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.length, streaming, pendingUser]);

  const send = async (text: string, task: 'chat' | 'cardio' = 'chat') => {
    const content = text.trim().slice(0, LIMITS.messageChars);
    if (!content || req.loading) return;
    setInput('');
    setPendingUser(content);
    await addChatMessage('user', content);
    setPendingUser(null);
    setStreaming('');
    let partial = '';
    await req.run(async (signal) => {
      const context = await loadCoachContext();
      // Keep the last 20 turns; the API needs the conversation to start with a user turn.
      const history = [...chat, { role: 'user' as const, content }].slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, LIMITS.messageChars) }));
      while (history.length && history[0].role !== 'user') history.shift();
      try {
        const full = await streamCoach({ task, context, messages: history }, (t) => {
          partial = t;
          setStreaming(t);
        }, signal);
        if (full) await addChatMessage('assistant', full);
      } catch (err) {
        if (partial.trim()) await addChatMessage('assistant', `${partial.trim()}\n\n(Response cut off.)`);
        if (err instanceof CoachError && err.kind === 'aborted') return;
        throw err;
      }
    });
    setStreaming(null);
  };

  const empty = chat.length === 0 && streaming === null && !pendingUser;

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col lg:min-h-[calc(100dvh-6rem)]">
      <PageHeader
        title="Coach"
        subtitle="Your AI strength coach knows your full training history."
        action={
          chat.length > 0 && (
            <IconButton label="Clear conversation" onClick={() => setConfirmClear(true)}>
              <Trash2 className="size-5" aria-hidden />
            </IconButton>
          )
        }
      />

      {!settings.aiEnabled || availability.state === 'unavailable' ? (
        <CoachNotice message={availability.state === 'unavailable' ? availability.message : 'AI Coach is turned off.'} kind={availability.state === 'unavailable' ? availability.kind : 'disabled'} />
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <button type="button" disabled={!ready} onClick={() => setSuggestOpen(true)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-50">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
            <Sparkles className="size-4 text-accent" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">Exercise ideas</span>
            <span className="block text-[12px] text-ink-3">Swaps & additions</span>
          </span>
        </button>
        <button type="button" disabled={!ready || req.loading} onClick={() => void send('How much cardio should I be doing with my goal and schedule?', 'cardio')} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-50">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-push-soft">
            <HeartPulse className="size-4 text-push" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">Cardio advice</span>
            <span className="block text-[12px] text-ink-3">How much, when</span>
          </span>
        </button>
      </div>

      <div className="flex-1 space-y-4 pb-4" aria-live="polite">
        {empty && (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-surface-2">
              <Bot className="size-7 text-accent" aria-hidden />
            </div>
            <p className="text-[17px] font-semibold">Ask anything about your training</p>
            <p className="mt-1 max-w-xs text-[14px] text-ink-2">The coach sees your recent sets, PRs, stalls, and weekly volume. It's a coach, not a doctor.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {QUICK.map((q) => (
                <button key={q} type="button" disabled={!ready} onClick={() => void send(q)} className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.content} />
        ))}
        {pendingUser && <Bubble role="user" text={pendingUser} />}
        {streaming !== null &&
          (streaming ? (
            <Bubble role="assistant" text={streaming} />
          ) : (
            <div className="flex items-center gap-2 px-1">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft">
                <Bot className="size-4 text-accent" aria-hidden />
              </span>
              <div className="rounded-2xl rounded-tl-md bg-surface px-4 py-3 ring-1 ring-line">
                <TypingDots />
              </div>
            </div>
          ))}
        {req.error && <p className="px-1 text-[14px] text-danger">{req.error}</p>}
        <div ref={endRef} />
      </div>

      {chat.length > 0 && ready && !req.loading && (
        <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {QUICK.slice(0, 3).map((q) => (
            <button key={q} type="button" onClick={() => void send(q)} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:text-ink">
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-xl shadow-black/20 focus-within:border-accent/50">
          <label htmlFor="coach-input" className="sr-only">
            Message the coach
          </label>
          <textarea
            id="coach-input"
            rows={1}
            value={input}
            disabled={!ready}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={ready ? 'Ask your coach...' : 'Coach unavailable'}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-ink outline-none placeholder:text-ink-3 [field-sizing:content]"
          />
          {req.loading ? (
            <button type="button" onClick={req.stop} aria-label="Stop response" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-ink">
              <Square className="size-4 fill-current" aria-hidden />
            </button>
          ) : (
            <button type="submit" aria-label="Send" disabled={!ready || !input.trim()} className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors', input.trim() && ready ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-ink-3')}>
              <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </div>
      </form>

      <Sheet open={suggestOpen} onClose={() => setSuggestOpen(false)} title="Exercise ideas" wide>
        <CoachSuggestions program={program} />
      </Sheet>
      <ConfirmDialog open={confirmClear} title="Clear conversation?" message="This deletes your chat history with the coach on this device." confirmLabel="Clear" danger onConfirm={clearChat} onClose={() => setConfirmClear(false)} />
    </div>
  );
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  if (role === 'user') {
    return (
      <div className="animate-fade-up flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-accent px-4 py-2.5 text-[15px] text-accent-ink">{text}</div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
        <Bot className="size-4 text-accent" aria-hidden />
      </span>
      <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-md bg-surface px-4 py-3 ring-1 ring-line">
        <RichText text={text} className="space-y-2.5 text-[15px] leading-relaxed text-ink" />
      </div>
    </div>
  );
}
