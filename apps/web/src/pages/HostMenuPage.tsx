import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/PageShell';

export function HostMenuPage() {
  return (
    <PageShell>
      <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-grape">
        Host
      </p>
      <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
        Admin menu
      </h1>
      <p className="mt-2 text-ink/70">Choose what to administer.</p>
      <div className="mt-8 grid gap-3">
        <Button asChild size="lg" className="w-full">
          <Link to="/host/quizzer">Quizzer</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/host/crossword">Crossword</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/host/wordsearch">Word search</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/host/system">System</Link>
        </Button>
      </div>
    </PageShell>
  );
}
