import type { ReactNode } from 'react';

export function PageShell({
  children,
  tight = false,
}: {
  children: ReactNode;
  tight?: boolean;
}) {
  return (
    <div className="min-h-[100dvh] bg-playfield px-4 py-8">
      <div
        className={`mx-auto w-full max-w-xl rounded-[2rem] border-4 border-white/50 bg-white/70 p-6 shadow-pop backdrop-blur ${
          tight ? '' : 'text-center'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
