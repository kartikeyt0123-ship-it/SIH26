/**
 * OTP delivery.
 *
 * THE RULE: this module never claims a message was sent. When no provider is
 * configured it returns `channel: "console"` and hands the code back to the
 * caller so the sign-up screen can display it, captioned as undelivered. A
 * screen that says "code sent to your phone" while no SMS exists is the kind of
 * lie that survives a demo and fails in front of a real dealer standing there
 * with a silent handset.
 *
 * WIRING A REAL PROVIDER: set SMS_API_URL (and SMS_API_KEY if it needs one).
 * The request shape below is the common denominator across Indian transactional
 * SMS gateways — a POST with `to` and `message`. `channel` becomes "sms",
 * `code` is withheld from the response, and the UI wording changes on its own
 * because it keys off `channel`.
 */

export type OtpDelivery = {
  /** sms | console. The UI must not say "sent" unless this is "sms". */
  channel: "sms" | "console";
  /** Present ONLY when nothing was actually delivered. */
  code?: string;
  /** Shown verbatim under the code field. */
  message: string;
};

export async function deliverOtp(phone: string, code: string): Promise<OtpDelivery> {
  const endpoint = process.env.SMS_API_URL?.trim();

  if (!endpoint) {
    return {
      channel: "console",
      code,
      message:
        "No SMS provider is configured, so nothing was sent. This is your code — it is shown here because this is a development build.",
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SMS_API_KEY ? { Authorization: `Bearer ${process.env.SMS_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        to: `+91${phone}`,
        message: `${code} is your Rachna AI verification code. It expires in 10 minutes.`,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) throw new Error(`gateway returned ${res.status}`);

    return {
      channel: "sms",
      message: `Code sent by SMS to +91 ${phone.slice(0, 5)} ${phone.slice(5)}.`,
    };
  } catch {
    // A gateway that failed has NOT delivered anything, and saying otherwise
    // would strand the dealer waiting for a message that is never coming. Fall
    // back to showing the code and say plainly that the send failed.
    return {
      channel: "console",
      code,
      message:
        "The SMS gateway did not accept the message, so nothing was sent. This is your code.",
    };
  }
}

/** True when a real gateway is configured. Used to word the sign-in screen. */
export const smsConfigured = () => Boolean(process.env.SMS_API_URL?.trim());
