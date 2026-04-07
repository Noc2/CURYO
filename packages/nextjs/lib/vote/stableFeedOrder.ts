export function stabilizeSessionFeedOrder(previousIds: readonly string[], nextIds: readonly string[]) {
  if (previousIds.length === 0) {
    return [...nextIds];
  }

  const nextIdSet = new Set(nextIds);
  const preservedIds = previousIds.filter(id => nextIdSet.has(id));
  const preservedIdSet = new Set(preservedIds);
  const appendedIds = nextIds.filter(id => !preservedIdSet.has(id));

  return [...preservedIds, ...appendedIds];
}

function prioritizeNewIds(
  previousIds: readonly string[],
  nextIds: readonly string[],
  prioritizedIds: readonly string[] = [],
) {
  if (prioritizedIds.length === 0) {
    return [...nextIds];
  }

  const previousIdSet = new Set(previousIds);
  const nextIdSet = new Set(nextIds);
  const promotedIds = prioritizedIds.filter(id => nextIdSet.has(id) && !previousIdSet.has(id));
  if (promotedIds.length === 0) {
    return [...nextIds];
  }

  const promotedIdSet = new Set(promotedIds);
  return [...promotedIds, ...nextIds.filter(id => !promotedIdSet.has(id))];
}

export function resolveStableSessionFeedOrder(params: {
  previousIds: readonly string[];
  previousSessionKey: string;
  nextIds: readonly string[];
  nextSessionKey: string;
  prioritizedIds?: readonly string[];
}) {
  const { nextIds, nextSessionKey, previousIds, previousSessionKey, prioritizedIds } = params;

  if (previousSessionKey !== nextSessionKey) {
    return [...nextIds];
  }

  return prioritizeNewIds(previousIds, stabilizeSessionFeedOrder(previousIds, nextIds), prioritizedIds);
}
