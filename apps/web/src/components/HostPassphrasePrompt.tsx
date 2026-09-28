import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/PageShell';

export function HostPassphrasePrompt({
  checking,
  error,
  onSubmit,
}: {
  checking: boolean;
  error: string | null;
  onSubmit: (secret: string) => void;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const secret = value.trim();
    if (!secret) {
      return;
    }
    onSubmit(secret);
  };

  if (checking) {
    return (
      <PageShell>
        <p className="font-bold text-ink">Checking host passphrase…</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-grape">
        Host
      </p>
      <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
        Host passphrase
      </h1>
      <p className="mt-2 text-ink/70">
        Enter the passphrase from the server HOST_SECRET. It stays in this
        browser until you close the tab.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="host-secret">Passphrase</Label>
          <Input
            id="host-secret"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            aria-invalid={Boolean(error)}
          />
        </div>
        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={!value.trim()}>
          Unlock host controls
        </Button>
      </form>
    </PageShell>
  );
}
