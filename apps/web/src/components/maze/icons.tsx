export function CrawlingBaby({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="60" rx="18" ry="2.4" fill="#1f2933" opacity="0.12" />
      <ellipse cx="21" cy="11" rx="5.5" ry="3.6" fill="#f3b899" />
      <ellipse cx="43" cy="11" rx="5.5" ry="3.6" fill="#f3b899" />
      <ellipse cx="22" cy="17" rx="4" ry="2.2" fill="#e8a0a0" opacity="0.7" />
      <ellipse cx="42" cy="17" rx="4" ry="2.2" fill="#e8a0a0" opacity="0.7" />
      <path d="M18 16c-1 6 2 9 6 8" fill="none" stroke="#7b2cbf" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M46 16c1 6-2 9-6 8" fill="none" stroke="#7b2cbf" strokeWidth="4.5" strokeLinecap="round" />
      <ellipse cx="32" cy="28" rx="12" ry="8" fill="#7b2cbf" />
      <path d="M22 26c2 4 18 4 20 0" fill="#9b4de0" />
      <circle cx="32" cy="38" r="16" fill="#f6c7a8" />
      <path d="M18 32c1-12 10-18 14-18s13 6 14 18c-4-3-24-3-28 0z" fill="#6b3a2a" />
      <ellipse cx="22" cy="39" rx="4.6" ry="5.4" fill="#1f2933" />
      <ellipse cx="42" cy="39" rx="4.6" ry="5.4" fill="#1f2933" />
      <ellipse cx="23.3" cy="37.4" rx="1.7" ry="1.9" fill="#fff" />
      <ellipse cx="43.3" cy="37.4" rx="1.7" ry="1.9" fill="#fff" />
      <ellipse cx="32" cy="44" rx="1.3" ry="0.9" fill="#e7b199" />
      <path d="M26 47c2.2 2.4 9.8 2.4 12 0" fill="none" stroke="#c46b64" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="20" cy="45.5" rx="2.6" ry="1.5" fill="#f4a4a4" />
      <ellipse cx="44" cy="45.5" rx="2.6" ry="1.5" fill="#f4a4a4" />
      <ellipse cx="12" cy="54" rx="7" ry="5" fill="#f6c7a8" />
      <ellipse cx="52" cy="54" rx="7" ry="5" fill="#f6c7a8" />
      <ellipse cx="11" cy="53" rx="3.2" ry="2" fill="#fff" opacity="0.35" />
      <ellipse cx="51" cy="53" rx="3.2" ry="2" fill="#fff" opacity="0.35" />
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
