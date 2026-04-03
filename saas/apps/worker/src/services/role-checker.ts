const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  streamer: 100,
  moderator: 80,
  mod: 80,
  vip: 60,
  subscriber: 40,
  sub: 40,
  follower: 20,
  everyone: 0,
};

/**
 * Check whether a user's roles satisfy the minimum required role level.
 *
 * The user passes if their highest role rank is >= the lowest rank among required roles.
 * An empty `requiredRoles` list or a list containing "everyone" always passes.
 */
export function checkRoleRequirement(
  userRoles: string[],
  requiredRoles: string[],
): boolean {
  if (
    requiredRoles.length === 0 ||
    requiredRoles.some((r) => r.toLowerCase() === "everyone")
  ) {
    return true;
  }

  const minRequired = Math.min(
    ...requiredRoles.map((r) => ROLE_HIERARCHY[r.toLowerCase()] ?? 0),
  );
  const maxUser = Math.max(
    ...userRoles.map((r) => ROLE_HIERARCHY[r.toLowerCase()] ?? 0),
    0,
  );

  return maxUser >= minRequired;
}
