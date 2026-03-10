export interface EmailNotificationSettingsState {
  email: string;
  verified: boolean;
  roundResolved: boolean;
  settlingSoonHour: boolean;
  settlingSoonDay: boolean;
  followedSubmission: boolean;
  followedResolution: boolean;
}

export type EmailNotificationSettingsPayload = Omit<EmailNotificationSettingsState, "verified">;

export const DEFAULT_EMAIL_NOTIFICATION_SETTINGS: EmailNotificationSettingsState = {
  email: "",
  verified: false,
  roundResolved: false,
  settlingSoonHour: false,
  settlingSoonDay: false,
  followedSubmission: false,
  followedResolution: false,
};
