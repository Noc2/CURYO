export interface NotificationPreferencesState {
  roundResolved: boolean;
  settlingSoonHour: boolean;
  settlingSoonDay: boolean;
  followedSubmission: boolean;
  followedResolution: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesState = {
  roundResolved: true,
  settlingSoonHour: true,
  settlingSoonDay: true,
  followedSubmission: true,
  followedResolution: true,
};
