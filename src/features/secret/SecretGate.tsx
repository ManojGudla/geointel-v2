import { useState } from "react";
import { useDialog } from "@/hooks/useDialog";
import { fetchMaintenanceState } from "@/services/maintenance";
import { ApiUnavailableError } from "@/services/apiClient";
import { writeAdminKey } from "@/features/admin/adminSession";
import "./SecretGate.css";

/**
 * The lock behind the hidden entrance.
 *
 * The code is NOT checked here. It is sent to /api/admin/maintenance, which
 * compares it against GEOINTEL_ADMIN_KEY with a constant-time comparison and
 * answers with `adminKeyValid`. That distinction is the whole security story:
 * a secret compared in the browser is not a secret, because the value it is
 * compared against has to ship in the bundle, where anyone can read it. This
 * component knows only whether the server said yes.
 *
 * On yes, the key goes into the session the admin dashboard already reads
 * from, and we hand over to it - the dashboard auto-verifies a key it finds
 * there, so it opens unlocked rather than asking a second time.
 *
 * On no, it says so plainly. There is a temptation with a hidden door to be
 * coy - to close silently, or to pretend nothing happened - and it is worth
 * resisting: the only person who ever sees this dialog is someone who already
 * knows the gesture, and leaving them unable to tell a wrong code from a
 * broken server helps nobody.
 */

/**
 * What went wrong, in words the owner can act on.
 *
 * Every failure that was not an answer from the server used to read
 * "Couldn't reach the server to check that", including a code the browser
 * refused to send and a server that answered slowly. The two cases that
 * remain are now told apart: offline, or the request itself failed, with the
 * reason the request layer gave (timed out, unexpected response and so on).
 */
export function gateFailureMessage(caught: unknown, online = typeof navigator === "undefined" || navigator.onLine !== false): string {
  if (caught instanceof ApiUnavailableError) return caught.message;
  if (!online) return "You're offline. Connect to the internet and try again.";
  const reason = caught instanceof Error && caught.message ? caught.message : "no reason given";
  return `Couldn't check the code: ${reason}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SecretGate({ open, onClose }: Props) {
  const dialogRef = useDialog({ open, onClose });
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || checking) return;

    setChecking(true);
    setError(null);
    try {
      const result = await fetchMaintenanceState(trimmed);
      if (result.adminKeyValid) {
        writeAdminKey(trimmed);
        // A full navigation rather than a route change: this app has no
        // router, and /admin is a separate top-level branch in App.tsx.
        window.location.assign("/admin");
        return;
      }
      setError("That code is not right.");
      setCode("");
    } catch (caught) {
      setError(gateFailureMessage(caught));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="secret-gate__scrim" onClick={onClose}>
      <div
        ref={dialogRef}
        className="secret-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="secret-gate-title"
        /* The scrim closes on click; the panel must not close when the panel
           itself is clicked, which is where the typing happens. */
        onClick={(event) => event.stopPropagation()}
      >
        <form className="secret-gate__form" onSubmit={submit}>
          <span className="secret-gate__mark" aria-hidden="true">
            🔒
          </span>
          <h2 className="secret-gate__title" id="secret-gate-title">
            Restricted
          </h2>
          <p className="secret-gate__sub">This area is for the site owner. Enter the access code to continue.</p>

          <input
            className="secret-gate__input"
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Access code"
            aria-label="Access code"
            autoComplete="off"
            /* Phone keyboards otherwise capitalise the first letter and swap
               ' for a curly apostrophe, and the code then reads as wrong. */
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            disabled={checking}
          />

          {error && (
            <p className="secret-gate__error" role="alert">
              {error}
            </p>
          )}

          <div className="secret-gate__actions">
            <button type="button" className="secret-gate__btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="secret-gate__btn secret-gate__btn--primary"
              disabled={checking || !code.trim()}
            >
              {checking ? "Checking…" : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
