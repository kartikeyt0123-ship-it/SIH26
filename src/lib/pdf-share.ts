"use client";

/**
 * Getting a quotation PDF to a customer without depending on a live URL.
 *
 * THE PROBLEM: sending a link means the customer can only read the quotation
 * while the server that produced it is still reachable. On a tunnelled demo
 * build that is minutes; on a real deployment it is still a document that
 * silently rots if the host moves. A quotation is a record — it should survive
 * on the customer's phone.
 *
 * THE FIX: share the FILE. `navigator.share` with a `files` payload hands the
 * actual PDF to whichever app the dealer picks, so WhatsApp attaches a real
 * document that downloads to the customer's device and works for ever after.
 * No link, no origin, no dependency on us being up.
 *
 * WHERE IT IS NOT AVAILABLE — desktop browsers, mostly — the PDF is downloaded
 * to the dealer's machine and WhatsApp Web is opened with the message, so they
 * attach the file they now have. That is one manual step, and it is honest
 * about being one rather than pretending the file went out on its own.
 *
 * Nothing here auto-sends. The dealer always presses send.
 */

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "failed";

async function fetchPdf(quotationId: string, filename: string): Promise<File | null> {
  try {
    const res = await fetch(`/api/quotations/${quotationId}/pdf`, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    // Typed explicitly: some browsers hand back a generic octet-stream, and a
    // share payload without a real PDF type is refused by the target app.
    return new File([blob], filename, { type: "application/pdf" });
  } catch {
    return null;
  }
}

function saveToDisk(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick rather than immediately: revoking synchronously
  // can cancel the download before the browser has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const safeName = (customer: string) =>
  `Rachna-quotation-${customer.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "customer"}.pdf`;

/** Download the quotation to this device. Always available. */
export async function downloadQuotation(quotationId: string, customer: string) {
  const file = await fetchPdf(quotationId, safeName(customer));
  if (!file) return false;
  saveToDisk(file);
  return true;
}

/**
 * Offer the PDF to WhatsApp as a real attachment.
 *
 * Returns what actually happened so the UI can say so, rather than assuming
 * success. "cancelled" is a normal outcome — the dealer closed the share sheet —
 * and must not be reported as a failure.
 */
export async function shareQuotation(
  quotationId: string,
  customer: string,
  message: string,
): Promise<ShareOutcome> {
  const file = await fetchPdf(quotationId, safeName(customer));
  if (!file) return "failed";

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };

  // `canShare` is checked with the actual file, not merely for the API's
  // existence: several browsers expose `share` but refuse file payloads, and
  // calling it anyway throws after the user has already tapped.
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: message, title: "Rachna AI quotation" });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
      // Fall through to the download path rather than leaving them stuck.
    }
  }

  saveToDisk(file);
  return "downloaded";
}

/** wa.me addressed to one number — opens that chat, with no contact picker. */
export function whatsappTextLink(phone: string | null | undefined, message: string) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10 || !/^[6-9]/.test(ten)) return null;
  return `https://wa.me/91${ten}?text=${encodeURIComponent(message)}`;
}

/**
 * Send the quotation to ONE customer, without hunting for them in a contact list.
 *
 * The ordering here is the whole point. `navigator.share` can attach the file
 * but cannot address it — it always opens a picker, so the dealer has to find
 * the customer themselves. A `wa.me` link is the opposite: it opens exactly
 * that person's chat with the message written, but WhatsApp gives no way for a
 * web page to attach a file to it. Neither API does both, and no amount of
 * arranging them will change that.
 *
 * So this does the half that cannot be automated FIRST — it puts the PDF on the
 * device — and then opens the right chat. The dealer lands in the correct
 * conversation with the message ready and the file already downloaded, and taps
 * the paperclip. No searching, and no pretending the attachment happened by
 * itself.
 *
 * Sending outright, file and recipient together, needs the WhatsApp Business
 * API: a Meta business account, a verified sender and a pre-approved template.
 * That is a commercial onboarding, not a missing line of code.
 */
export async function sendQuotationTo(
  quotationId: string,
  customer: string,
  phone: string | null | undefined,
  message: string,
): Promise<{ outcome: "opened" | "no-number" | "failed"; downloaded: boolean }> {
  const link = whatsappTextLink(phone, message);
  if (!link) return { outcome: "no-number", downloaded: false };

  // Downloaded before the tab opens: a browser will block a popup that happens
  // after an await on some platforms, and a dealer who lands in the chat with
  // no file is worse off than one who waits half a second.
  const downloaded = await downloadQuotation(quotationId, customer);

  const win = window.open(link, "_blank", "noopener");
  if (!win) {
    // Popup blocked — fall back to navigating this tab rather than silently
    // doing nothing.
    window.location.href = link;
  }
  return { outcome: "opened", downloaded };
}
