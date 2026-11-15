export function profileIdFromArgs(args: unknown): string {
  const profileId =
    args && typeof args === 'object' && 'profileId' in args && typeof args.profileId === 'string'
      ? args.profileId.trim()
      : ''
  if (!profileId) {
    throw new Error('invalid_dolphin_profile_id')
  }
  return profileId
}
