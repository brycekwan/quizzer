import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isValidPlayerName } from '@party/shared';
import { useSession } from '@/hooks/useSession';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/PageShell';

export function LoginPage() {
  const navigate = useNavigate();
  const { connected, playerId, playerName, error, setError, login } =
    useSession();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (playerId && playerName) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidPlayerName(name)) {
      setError('Enter a name between 1 and 24 characters');
      return;
    }
    setSubmitting(true);
    const result = await login(name);
    setSubmitting(false);
    if (result.ok) {
      navigate('/', { replace: true });
    }
  };

  return (
    <PageShell>
      <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-grape">
        Party
      </p>
      <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
        Log in
      </h1>
      <p className="mt-2 text-ink/70">Pick a unique name to play.</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Display name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Captain Bark"
            autoComplete="off"
            aria-invalid={Boolean(error)}
          />
        </div>
        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting || !connected}
        >
          {submitting ? 'Signing in…' : 'Continue'}
        </Button>
      </form>
    </PageShell>
  );
}
