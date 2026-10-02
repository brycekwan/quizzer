/** Chunky crawling baby. Built from a few fat shapes so it still reads inside a maze cell. */
export function CrawlingBaby({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <ellipse
        cx="21"
        cy="20"
        rx="11"
        ry="7.5"
        fill="#fff7ed"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <circle cx="12" cy="16" r="8" fill="#f6c7a8" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M8 9c1.4-4 5.2-3.4 4.4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      <circle cx="15.5" cy="28.5" r="3.1" fill="#f6c7a8" stroke="currentColor" strokeWidth="2.25" />
      <circle cx="24.5" cy="28.5" r="3.1" fill="#f6c7a8" stroke="currentColor" strokeWidth="2.25" />
    </svg>
  );
}

export function OpenDoor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={className} aria-hidden="true">
      <path d="M8 6h24v46H8z" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M32 10l10 4v38l-10-4z" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="4" />
      <circle cx="28" cy="30" r="2" fill="currentColor" />
    </svg>
  );
}

export function Refrigerator({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 56" className={className} aria-hidden="true">
      <rect x="6" y="4" width="28" height="48" rx="3" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M6 22h28" stroke="currentColor" strokeWidth="4" />
      <path d="M28 12v4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M28 30v8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function MilkBottle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 56" className={className} aria-hidden="true">
      <path
        d="M12 6h8v6c6 4 6 8 6 12v22a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6V24c0-4 0-8 6-12V6z"
        fill="currentColor"
        opacity="0.2"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M12 6h8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M8 34h16" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
      <path
        d="M12 20s-7-4.4-7-9.2C5 7.6 7.2 6 9.4 6c1.4 0 2.3.6 2.6 1.2.3-.6 1.2-1.2 2.6-1.2 2.2 0 4.4 1.6 4.4 4.8C19 15.6 12 20 12 20z"
        fill={filled ? '#e11d48' : 'none'}
        stroke="#e11d48"
        strokeWidth="2"
      />
    </svg>
  );
}
