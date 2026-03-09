import {
  followProfile,
  isFollowingOnChain,
  unfollowProfile,
  waitForPonderIndexed,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getFollowState, getFollowing } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

test.describe("Follow lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const FOLLOW_REGISTRY = CONTRACT_ADDRESSES.FollowRegistry;
  const FOLLOWER = ANVIL_ACCOUNTS.account2.address.toLowerCase();
  const TARGET = ANVIL_ACCOUNTS.account8.address.toLowerCase();

  test("follow and unfollow index through Ponder", async () => {
    test.setTimeout(90_000);

    if (await isFollowingOnChain(FOLLOWER, TARGET, FOLLOW_REGISTRY)) {
      const unfollowed = await unfollowProfile(TARGET, FOLLOWER, FOLLOW_REGISTRY);
      expect(unfollowed).toBe(true);
      await waitForPonderIndexed(async () => {
        const state = await getFollowState(FOLLOWER, TARGET);
        return state.following === false;
      }, 15_000);
    }

    const followed = await followProfile(TARGET, FOLLOWER, FOLLOW_REGISTRY);
    expect(followed).toBe(true);
    expect(await isFollowingOnChain(FOLLOWER, TARGET, FOLLOW_REGISTRY)).toBe(true);

    const indexedFollow = await waitForPonderIndexed(async () => {
      const state = await getFollowState(FOLLOWER, TARGET);
      return state.following === true;
    });
    expect(indexedFollow).toBe(true);

    const followingList = await getFollowing(FOLLOWER);
    expect(followingList.items.some(item => item.walletAddress.toLowerCase() === TARGET)).toBe(true);

    const unfollowed = await unfollowProfile(TARGET, FOLLOWER, FOLLOW_REGISTRY);
    expect(unfollowed).toBe(true);
    expect(await isFollowingOnChain(FOLLOWER, TARGET, FOLLOW_REGISTRY)).toBe(false);

    const indexedUnfollow = await waitForPonderIndexed(async () => {
      const state = await getFollowState(FOLLOWER, TARGET);
      return state.following === false;
    });
    expect(indexedUnfollow).toBe(true);
  });
});
