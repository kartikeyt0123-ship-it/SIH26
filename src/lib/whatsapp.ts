/**
 * WhatsApp hand-off.
 *
 * WHAT THIS ACTUALLY DOES: builds a `wa.me` deep link with the message
 * pre-filled. Tapping it opens WhatsApp — the app on a phone, WhatsApp Web on a
 * desktop — with the chat open and the text ready. The dealer presses send.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM: that the message was sent, or that the
 * number is even on WhatsApp. Neither can be known without the WhatsApp
 * Business API, which needs a Meta business account, a verified sender and an
 * approved template per message type. Until that exists, every label in the UI
 * says "open in WhatsApp", never "send" — the dealer is the one who sends, and
 * they will see immediately if the number is not registered.
 *
 * WHERE THE REAL API GOES: a `sendTemplate()` alongside `waLink()`, chosen by
 * whether WHATSAPP_TOKEN is configured, with the same call sites.
 */

/** wa.me wants digits only, country code included, no plus and no spaces. */
export function waNumber(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10 || !/^[6-9]/.test(ten)) return null;
  return `91${ten}`;
}

export function waLink(phone: string | null | undefined, message: string): string | null {
  const to = waNumber(phone);
  if (!to) return null;
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}

/* ------------------------------- messages -------------------------------- */

export function quotationMessage(input: {
  customerName: string;
  dealerName: string;
  total: number;
  pdfUrl: string;
  itemCount: number;
}) {
  const total = `Rs. ${Math.round(input.total).toLocaleString("en-IN")}`;
  return [
    `Namaste ${input.customerName.split(" ")[0]},`,
    ``,
    `Your quotation from ${input.dealerName} is ready.`,
    `${input.itemCount} items, materials only — ${total}.`,
    ``,
    `Full breakdown with every measurement and rate:`,
    input.pdfUrl,
    ``,
    `Do tell us if you would like anything changed.`,
  ].join("\n");
}

export function followUpMessage(input: {
  customerName: string;
  dealerName: string;
  link?: string | null;
  daysQuiet: number;
}) {
  const first = input.customerName.split(" ")[0];
  const lines = [
    `Namaste ${first},`,
    ``,
    input.daysQuiet >= 7
      ? `Just checking in about the painting you were planning with ${input.dealerName}.`
      : `Checking in about the design you started with ${input.dealerName}.`,
  ];
  if (input.link) {
    lines.push(``, `Your colour selection is still open here:`, input.link);
  }
  lines.push(``, `Happy to help if you have any questions.`);
  return lines.join("\n");
}

export function shadeRequestMessage(input: {
  customerName: string;
  dealerName: string;
  shadeName: string;
}) {
  return [
    `Namaste ${input.customerName.split(" ")[0]},`,
    ``,
    `Good news — ${input.dealerName} can now arrange ${input.shadeName}, the colour you asked about.`,
    ``,
    `Shall we add it to your quotation?`,
  ].join("\n");
}
