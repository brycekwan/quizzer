import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/PageShell';

export function CrosswordAdminPage() {
  return (
    <PageShell>
      <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-grape">
        Crossword host
      </p>
      <h1 className="font-display text-4xl font-bold text-ink">Coming soon</h1>
      <p className="mt-2 text-ink/70">
        Player progress and reset controls will show up here.
      </p>
      <Button asChild size="lg" className="mt-8 w-full">
        <Link to="/host">Back to host menu</Link>
      </Button>
    </PageShell>
  );
}
