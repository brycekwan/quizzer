import { useState } from 'react';
import { readHostSecret, writeHostSecret } from '@/lib/hostSecret';

export function useHostSecret() {
  const [secret, setSecret] = useState<string | null>(() => readHostSecret());
  const [attempt, setAttempt] = useState(0);

  const save = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    writeHostSecret(trimmed);
    setSecret(trimmed);
    setAttempt((current) => current + 1);
  };

  return { secret, attempt, save };
}
