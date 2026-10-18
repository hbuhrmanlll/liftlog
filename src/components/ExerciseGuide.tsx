import { AlertCircle, CheckCircle2, CirclePlay, ExternalLink } from 'lucide-react';
import { parseYouTubeId, youtubeEmbedUrl, youtubeSearchUrl } from '../lib/youtube';
import { cx } from './ui';

export function VideoBlock({ name, videoUrl, className }: { name: string; videoUrl?: string; className?: string }) {
  const id = parseYouTubeId(videoUrl);
  if (id) {
    return (
      <div className={cx('overflow-hidden rounded-2xl border border-line bg-black', className)}>
        <div className="relative aspect-video">
          <iframe
            className="absolute inset-0 size-full"
            src={youtubeEmbedUrl(id)}
            title={`${name} form video`}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
    );
  }
  return (
    <a
      href={youtubeSearchUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      className={cx('flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 transition-colors hover:bg-surface-3', className)}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#ff0033]/15 text-[#ff3355]">
        <CirclePlay className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">Watch how to do it</span>
        <span className="block text-[13px] text-ink-3">Opens YouTube search in a new tab</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-ink-3" aria-hidden />
    </a>
  );
}

export function CuesAndMistakes({ cues, mistakes }: { cues: string[]; mistakes: string[] }) {
  return (
    <div className="space-y-5">
      {cues.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-ink-3">Form cues</h3>
          <ul className="space-y-2">
            {cues.map((c) => (
              <li key={c} className="flex gap-2.5 text-[15px] leading-snug text-ink">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-up" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}
      {mistakes.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-ink-3">Common mistakes</h3>
          <ul className="space-y-2">
            {mistakes.map((m) => (
              <li key={m} className="flex gap-2.5 text-[15px] leading-snug text-ink-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-down" aria-hidden />
                {m}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
