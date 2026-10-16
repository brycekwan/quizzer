import { FormEvent, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { returnPath } from '@/lib/returnPath';
import { isValidPlayerName } from '@party/shared';
import { useSession } from '@/hooks/useSession';
import { readIdleTimeoutMessage } from '@/lib/idleTimeout';
import { readLoginLockedMessage } from '@/lib/loginLocked';
import { readSystemRemovalMessage } from '@/lib/systemRemoval';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/PageShell';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = returnPath(location.search);
  const { connected, playerId, playerName, error, setError, login } =
    useSession();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removalMessage] = useState(
    () =>
      readSystemRemovalMessage() ??
      readLoginLockedMessage() ??
      readIdleTimeoutMessage()
  );

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}/login`;
  }, []);

  if (playerId && playerName) {
    return <Navigate to={destination} replace />;
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
      navigate(destination, { replace: true });
    }
  };

  const copyJoinLink = async () => {
    if (!joinUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
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
      {removalMessage ? (
        <p role="alert" className="mt-4 font-bold text-red-600">
          {removalMessage}
        </p>
      ) : null}
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

      {joinUrl ? (
        <div className="mt-8 flex flex-col items-center gap-3 border-t-2 border-ink/10 pt-6">
          <p className="text-sm font-extrabold uppercase tracking-wide text-ink/60">
            Scan to join
          </p>
          <div className="rounded-3xl border-4 border-ink/10 bg-white p-4 shadow-pop-sm">
            <QRCodeSVG
              value={joinUrl}
              size={180}
              aria-label="QR code linking to this party login page"
            />
          </div>
          <p className="max-w-[16rem] break-all text-xs font-semibold text-ink/45">
            {joinUrl}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyJoinLink()}
          >
            {copied ? 'Copied' : 'Copy join link'}
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}
