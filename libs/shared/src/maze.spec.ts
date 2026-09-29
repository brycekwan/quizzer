import { describe, expect, it } from 'vitest';
import { mazeCampaignScore } from './maze';

describe('mazeCampaignScore', () => {
  it('pays finished mazes during the run and hearts only after a win', () => {
    expect(mazeCampaignScore(0, 3, 'playing')).toBe(0);
    expect(mazeCampaignScore(1, 3, 'playing')).toBe(200);
    expect(mazeCampaignScore(2, 2, 'splash')).toBe(500);
    expect(mazeCampaignScore(1, 0, 'lost')).toBe(200);
    expect(mazeCampaignScore(3, 3, 'won')).toBe(1150);
    expect(mazeCampaignScore(3, 1, 'won')).toBe(1050);
  });
});
