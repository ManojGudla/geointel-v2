import { useMemo, useState } from "react";
import {
  NAME_MAX,
  certificateFileName,
  certificateText,
  cleanName,
  isValidName,
  renderCertificatePng,
} from "./certificateImage";
import "./Certificate.css";

/** The last name a player put on a certificate. Kept in this browser only. */
const NAME_KEY = "manowj.play.certificateName.v1";

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private browsing: the name is simply not remembered */
  }
}

/**
 * The certificate a player earns by winning.
 *
 * History, because it explains the shape. This was a certificate, then a
 * plain result card after the diploma version drew laughs for what it
 * claimed (a credential ID and a reference code for a game score). On 26
 * November 2026 the owner asked for a certificate again: "Congratulations",
 * a name the player enters, and a look of a proper, professional
 * certificate. That is what this is, and the earlier lesson is kept: it
 * claims nothing it cannot back. No credential number, no verification
 * stamp, the issuer named plainly, and one line of small print saying it
 * records a game result (certificateImage.ts has the reasoning).
 *
 * Two steps. First the player types their name, because a certificate with
 * no name on it is not one; the last name used is offered again next time.
 * Then the certificate, with a download (a print-size PNG) and a print
 * button (which also saves as PDF from the print dialog).
 *
 * The props are unchanged, so RoundSummary and every game are untouched.
 */
export function Certificate({
  gameTitle,
  headline,
  score,
  scoreLabel = "Score",
  detail,
}: {
  gameTitle: string;
  /** What they achieved, in the game's own words. */
  headline: string;
  score: number;
  scoreLabel?: string;
  /** One optional line of context, e.g. the target they chased. */
  detail?: string;
}) {
  const [draft, setDraft] = useState(loadName);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const [error, setError] = useState("");
  const issuedOn = useMemo(() => new Date(), []);

  const text = useMemo(
    () => (name ? certificateText({ name, gameTitle, headline, score, scoreLabel, detail, issuedOn }) : null),
    [name, gameTitle, headline, score, scoreLabel, detail, issuedOn]
  );

  const valid = isValidName(draft);

  if (!text) {
    return (
      <form
        className="cert-claim"
        aria-label="Claim your certificate"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const clean = cleanName(draft);
          saveName(clean);
          setName(clean);
        }}
      >
        <p className="cert-claim__title">
          <span aria-hidden="true">🏆</span> Congratulations! You have earned a certificate.
        </p>
        <label className="cert-claim__label" htmlFor="cert-name">
          Enter your name as it should appear on the certificate
        </label>
        <div className="cert-claim__row">
          <input
            id="cert-name"
            className="cert-claim__input"
            type="text"
            value={draft}
            maxLength={NAME_MAX + 10}
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Your full name"
            onChange={(e) => setDraft(e.target.value)}
            required
          />
          <button type="submit" className="play-btn play-btn--primary" disabled={!valid}>
            Create my certificate
          </button>
        </div>
        <p className="cert-claim__note">Your name stays in this browser. It is not sent anywhere.</p>
      </form>
    );
  }

  const download = async () => {
    setBusy("download");
    setError("");
    try {
      const blob = await renderCertificatePng(text);
      if (!blob) throw new Error("no canvas");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = certificateFileName({ name: text.name, gameTitle });
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setError("This browser could not draw the certificate image. Use Print, or take a screenshot.");
    } finally {
      setBusy(null);
    }
  };

  /*
    Printing goes through a frame holding only the certificate image, so
    the page size (A4 landscape, no margins) applies to the certificate
    alone and never to the area report, which has its own print layout.
  */
  const print = async () => {
    setBusy("print");
    setError("");
    try {
      const blob = await renderCertificatePng(text);
      if (!blob) throw new Error("no canvas");
      const url = URL.createObjectURL(blob);
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      if (!doc) throw new Error("no frame");
      doc.open();
      doc.write(
        `<!doctype html><title>${gameTitle.replace(/[<>&"]/g, "")} certificate</title><style>@page{size:A4 landscape;margin:0}html,body{margin:0;height:100%}img{display:block;width:100%;height:100%;object-fit:contain}</style><img alt="Certificate" src="${url}">`
      );
      doc.close();
      const img = doc.querySelector("img");
      await new Promise<void>((resolve) => {
        if (!img || img.complete) resolve();
        else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }
      });
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch {
      setError("Printing is not available here. Download the certificate and print the image instead.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <figure className="cert" aria-label={`${text.title}: ${text.name}`}>
      <div className="cert__sheet">
        <div className="cert__frame">
          <span className="cert__corner cert__corner--tl" aria-hidden="true" />
          <span className="cert__corner cert__corner--tr" aria-hidden="true" />
          <span className="cert__corner cert__corner--bl" aria-hidden="true" />
          <span className="cert__corner cert__corner--br" aria-hidden="true" />

          <p className="cert__brand">
            <img src="/icons/icon-32.png" alt="" width={20} height={20} aria-hidden="true" />
            {text.brand}
          </p>
          <h3 className="cert__title">{text.title}</h3>
          <p className="cert__rule" aria-hidden="true">
            <span />
          </p>
          <p className="cert__congrats">{text.congratulations}</p>
          <p className="cert__presented">{text.presentedTo}</p>
          <p className="cert__name">{text.name}</p>
          <p className="cert__for">{text.forLine}</p>
          <p className="cert__game">{text.game}</p>
          <p className="cert__result">{text.result}</p>
          {text.detail && <p className="cert__detail">{text.detail}</p>}

          <div className="cert__foot">
            <div className="cert__sig">
              <span className="cert__sig-value">{text.date}</span>
              <span className="cert__sig-label">{text.dateLabel}</span>
            </div>
            <div className="cert__seal" aria-hidden="true">
              <span>★</span>
            </div>
            <div className="cert__sig">
              <span className="cert__sig-value cert__sig-value--issuer">{text.issuer}</span>
              <span className="cert__sig-label">{text.issuerLabel}</span>
            </div>
          </div>
          <p className="cert__fine">
            {text.site} · {text.fine}
          </p>
        </div>
      </div>

      <figcaption className="cert__actions">
        <button type="button" className="play-btn play-btn--primary" onClick={download} disabled={busy !== null}>
          {busy === "download" ? "Preparing…" : "Download certificate"}
        </button>
        <button type="button" className="play-btn" onClick={print} disabled={busy !== null}>
          {busy === "print" ? "Preparing…" : "Print or save as PDF"}
        </button>
        <button
          type="button"
          className="play-btn play-btn--quiet"
          onClick={() => {
            setDraft(text.name);
            setName(null);
          }}
        >
          Change name
        </button>
        {error && (
          <span className="cert__error" role="alert">
            {error}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
