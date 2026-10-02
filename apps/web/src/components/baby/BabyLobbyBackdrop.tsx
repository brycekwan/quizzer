function BabyPortrait({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 112" className={className} aria-hidden="true">
      <rect x="6" y="6" width="84" height="100" rx="16" fill="#fff7ed" stroke="#f4a4b8" strokeWidth="4" />
      <circle cx="48" cy="48" r="22" fill="#f6c7a8" />
      <path d="M30 40c2-12 10-18 18-18s16 6 18 18c-6-4-30-4-36 0z" fill="#6b3a2a" />
      <circle cx="40" cy="50" r="3" fill="#1a1040" />
      <circle cx="56" cy="50" r="3" fill="#1a1040" />
      <circle cx="41" cy="49" r="1" fill="#fff" />
      <circle cx="57" cy="49" r="1" fill="#fff" />
      <path d="M42 58c2 3 10 3 12 0" fill="none" stroke="#c46b64" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="32" cy="56" rx="4" ry="2.4" fill="#f4a4a4" />
      <ellipse cx="64" cy="56" rx="4" ry="2.4" fill="#f4a4a4" />
      <path d="M36 28c2-8 8-10 8-4" fill="none" stroke="#6b3a2a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Rattle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 72" className={className} aria-hidden="true">
      <circle cx="26" cy="26" r="16" fill="#ffd166" stroke="#1a1040" strokeWidth="3" />
      <circle cx="22" cy="22" r="3" fill="#fff7ed" />
      <path d="M38 38l18 18" stroke="#7b2cbf" strokeWidth="6" strokeLinecap="round" />
      <circle cx="58" cy="58" r="6" fill="#ff6b6b" stroke="#1a1040" strokeWidth="3" />
    </svg>
  );
}

function Duck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 64" className={className} aria-hidden="true">
      <ellipse cx="36" cy="40" rx="22" ry="16" fill="#ffd166" stroke="#1a1040" strokeWidth="3" />
      <circle cx="54" cy="24" r="12" fill="#ffd166" stroke="#1a1040" strokeWidth="3" />
      <circle cx="58" cy="22" r="2" fill="#1a1040" />
      <path d="M64 26h12l-6 6h-8z" fill="#ff6b6b" stroke="#1a1040" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="24" cy="54" rx="8" ry="4" fill="#ff8a4c" />
    </svg>
  );
}

function Bottle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 80" className={className} aria-hidden="true">
      <rect x="18" y="4" width="12" height="10" rx="3" fill="#4cc9f0" stroke="#1a1040" strokeWidth="3" />
      <path d="M16 16h16l6 10v36a10 10 0 0 1-10 10H20a10 10 0 0 1-10-10V26z" fill="#e8f7ff" stroke="#1a1040" strokeWidth="3" />
      <path d="M12 40h24v18a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z" fill="#ffd166" />
    </svg>
  );
}

function Blocks({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 88 64" className={className} aria-hidden="true">
      <rect x="4" y="24" width="28" height="28" rx="4" fill="#ff6b6b" stroke="#1a1040" strokeWidth="3" />
      <text x="18" y="44" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff7ed">A</text>
      <rect x="30" y="8" width="28" height="28" rx="4" fill="#4cc9f0" stroke="#1a1040" strokeWidth="3" />
      <text x="44" y="28" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1a1040">B</text>
      <rect x="52" y="28" width="28" height="28" rx="4" fill="#06d6a0" stroke="#1a1040" strokeWidth="3" />
      <text x="66" y="48" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1a1040">C</text>
    </svg>
  );
}

function Teddy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="10" fill="#c4824a" stroke="#1a1040" strokeWidth="3" />
      <circle cx="60" cy="20" r="10" fill="#c4824a" stroke="#1a1040" strokeWidth="3" />
      <circle cx="40" cy="36" r="18" fill="#e0a56a" stroke="#1a1040" strokeWidth="3" />
      <ellipse cx="40" cy="42" rx="8" ry="6" fill="#f6c7a8" />
      <circle cx="34" cy="32" r="2.2" fill="#1a1040" />
      <circle cx="46" cy="32" r="2.2" fill="#1a1040" />
      <path d="M36 42c1.4 2 6.6 2 8 0" fill="none" stroke="#1a1040" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="24" cy="62" rx="10" ry="12" fill="#e0a56a" stroke="#1a1040" strokeWidth="3" />
      <ellipse cx="56" cy="62" rx="10" ry="12" fill="#e0a56a" stroke="#1a1040" strokeWidth="3" />
    </svg>
  );
}

const pieces = [
  { name: 'portrait-left', Icon: BabyPortrait, className: 'left-[4%] top-[8%] w-24 -rotate-6 sm:w-32' },
  { name: 'rattle', Icon: Rattle, className: 'right-[6%] top-[10%] w-16 rotate-12 sm:w-24' },
  { name: 'duck', Icon: Duck, className: 'left-[8%] bottom-[8%] w-20 rotate-3 sm:w-28' },
  { name: 'bottle', Icon: Bottle, className: 'right-[8%] bottom-[12%] w-14 -rotate-6 sm:w-16' },
  { name: 'blocks', Icon: Blocks, className: 'left-[28%] top-[6%] hidden w-24 sm:block' },
  { name: 'teddy', Icon: Teddy, className: 'right-[26%] bottom-[6%] hidden w-24 -rotate-3 sm:block' },
  { name: 'portrait-right', Icon: BabyPortrait, className: 'right-[2%] top-[38%] hidden w-20 rotate-6 md:block' },
];

export function BabyLobbyBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map(({ name, Icon, className }) => (
        <Icon key={name} className={`absolute drop-shadow-md ${className}`} />
      ))}
    </div>
  );
}
