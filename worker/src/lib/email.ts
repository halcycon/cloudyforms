/**
 * Email helpers — send, render, and configuration.
 */

export {
  sendOrgEmail,
  sendEmailWithConfig,
  type EmailOptions,
} from "./email-send";
export {
  getPlatformEmailConfig,
  resolveEmailConfig,
  parseFromAddress,
  type EmailProvider,
  type ResolvedEmailConfig,
} from "./email-config";
export {
  getOrgEmailBranding,
  renderOrgInviteEmail,
  renderFormReceiptEmail,
  renderFormNotificationEmail,
  type EmailBranding,
} from "./email-render";
