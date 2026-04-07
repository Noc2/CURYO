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
