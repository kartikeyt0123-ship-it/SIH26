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

/**
 * One in-flight fetch per quotation, and the result kept.
 *
 * The share sheet has to open in the same gesture as the tap or the browser
 * treats it as untrusted and refuses. Fetching a quarter-megabyte PDF first
 * spends that budget on the network, so the document is pulled ahead of time by
 * `prefetchQuotation` and this returns it instantly. Caching the promise rather
 * than the file also collapses a double-tap into a single request.
 */
const pdfCache = new Map<string, Promise<File | null>>();

async function loadPdf(quotationId: string, filename: string): Promise<File | null> {
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

function fetchPdf(quotationId: string, filename: string): Promise<File | null> {
  const hit = pdfCache.get(quotationId);
  if (hit) return hit;
  const p = loadPdf(quotationId, filename).then((f) => {
    // A failure is not cached — the next tap should try again rather than be
    // told for ever that the document cannot be built.
    if (!f) pdfCache.delete(quotationId);
    return f;
  });
  pdfCache.set(quotationId, p);
  return p;
}

/** Warm the cache so the first tap opens the share sheet with no wait. */
export function prefetchQuotation(quotationId: string, customer: string) {
  void fetchPdf(quotationId, safeName(customer));
}

/** True when this device can hand a file to another app. */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData & { files?: File[] }) => boolean;
    share?: unknown;
  };
  if (!nav.share || !nav.canShare) return false;
  try {
    // Probed with a real file: several browsers expose `share` but reject file
    // payloads, and finding that out after the tap strands the dealer.
    const probe = new File([new Blob(["x"], { type: "application/pdf" })], "p.pdf", {
      type: "application/pdf",
    });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
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
): Promise<{
  outcome: "shared" | "cancelled" | "opened" | "blocked" | "no-number" | "failed";
  downloaded: boolean;
}> {
  // Phone first: the share sheet carries the PDF *and* the message in one
  // action, so the customer receives an attachment rather than a link. That is
  // the only route on the open web that actually attaches a file to WhatsApp,
  // and it is worth the contact tap it costs.
  if (canShareFiles()) {
    const file = await fetchPdf(quotationId, safeName(customer));
    if (file) {
      const nav = navigator as Navigator & {
        share: (d: ShareData & { files?: File[] }) => Promise<void>;
      };
      try {
        await nav.share({ files: [file], text: message, title: "Rachna AI quotation" });
        return { outcome: "shared", downloaded: false };
      } catch (e) {
        // Backing out of the sheet is a normal thing to do, not an error, and
        // must not trigger a download the dealer did not ask for.
        if ((e as Error)?.name === "AbortError") return { outcome: "cancelled", downloaded: false };
      }
    }
  }

  // Desktop and anything without file sharing: put the PDF on the machine and
  // open the customer's own chat, so it is one paperclip away.
  const link = whatsappTextLink(phone, message);
  if (!link) {
    const saved = await downloadQuotation(quotationId, customer);
    return { outcome: saved ? "no-number" : "failed", downloaded: saved };
  }

  // OPENED BEFORE THE AWAIT, and that ordering is the whole point.
  //
  // A browser only honours window.open while it still considers the click to
  // be driving the code. Downloading the PDF first spends that permission on a
  // fetch, the popup is then refused, and the previous fallback — navigating
  // this tab to the link — threw the dealer out of the console into WhatsApp
  // and lost the page they were working on. Opening first keeps the console
  // exactly where it was.
  const win = window.open(link, "_blank", "noopener");

  const downloaded = await downloadQuotation(quotationId, customer);

  // Still blocked by a popup blocker: say so, and let the UI offer a plain
  // link. Never navigate this tab away from the dealer's own screen.
  if (!win) return { outcome: "blocked", downloaded };
  return { outcome: "opened", downloaded };
}

/**
 * The customer's chat with the message only. No file, no picker.
 *
 * Fully synchronous, so the click still counts as user activation and the tab
 * is never refused.
 */
export function openChatWith(phone: string | null | undefined, message: string) {
  const link = whatsappTextLink(phone, message);
  if (!link) return false;
  return Boolean(window.open(link, "_blank", "noopener"));
}
