/**
 * Activity feed — recent `vouch:claimed` edges and `tipped` transfers from RPC (the
 * sky is moving): "@x lit a star for @y" / "@x tipped @y 2 USDC". Social proof of life on
 * the dashboard, even when you're idle. RPC-direct (durable indexer deferred); merged by
 * ledger, newest-first, capped.
 */
import { EVENTS } from '@alvinmunk/shared';
import { fetchReputationEvents, fetchRewardsEvents, type RepEvent } from './events';

export interface FeedItem {
  kind: 'vouch' | 'tip';
  from: string;
  to: string;
  ledger: number;
  /** Tip amount in stroops; undefined for vouches. */
  amount?: big int | number;
}

export async function fetchActivity(max = 12): Promise<FeedItem[]> {
  const [repEvents, rewardsEvents] = await Promise.all([fetchReputationEvents(), fetchRewardsEvents()]);

  const items: FeedItem[] = [];
  for (const ev of repEvents) pushVouch(items, ev);
  for (const ev of rewardsEvents) pushTip(items, ev);

  // Newest first. Merging two oldest-first streams by ledger keeps the cap correct even
  // when one stream is much hotter than the other. Stable sort keeps RPC order within
  // a ledger, and the cap is applied on the merged result.
  items.sort((a, b) => b.ledger - a.ledger);
  return items.slice(0, max);
}

function pushVouch(items: FeedItem[], { topics, data, ledger }: RepEvent): void {
  if (topics[0] !== EVENTS.VOUCH || topics[1] !== 'claimed') return;
  if (!Array.isArray(data)) return;
  // ('vouch','claimed') -> (vouch_id, from, claimer)
  items.push({ kind: 'vouch', from: String(data[1]), to: String(data[2]), ledger });
}

function pushTip(items: FeedItem[], { topics, data, ledger }: RepEvent): void {
  // ('tipped', from, to) -> amount. The window also contains other rewards
  // events (claims, distributions), so filter on the event name.
  if (topics[0] !== EVENTS.TIPPED) return;
  if (topics.length < 3) return;
  const amount = toNumberOrBig(data);
  if (amount === null) return;
  items.push({ kind: 'tip', from: String(topics[1]), to: String(topics[2]), ledger, amount });
}

/** Normalise a decoded amount (i128 arrives as bigint, smaller as number) to a bigint-or-number. */
function toNumberOrBig(data: unknown): bigint | number | null {
  if (typeof data === 'bigint' || typeof data === 'number') return data;
  if (typeof data === 'string' && /^[0-9]+$/.test(data)) return BigInt(data);
  return null;
}
