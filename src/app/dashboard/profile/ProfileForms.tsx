"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  changeEmail,
  confirmTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
  removeAuthenticator,
  removeAvatar,
  startTwoFactor,
  updateName,
  uploadAvatar,
  type ConfirmState,
  type FormState,
} from "./actions";

const empty: ConfirmState = {};
const SIZE = 512;

/**
 * Square-crops and scales to 512 px, re-encoding as JPEG. Drawing through a
 * canvas drops the EXIF block, including any GPS position the camera added.
 */
async function toAvatarJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.86)
  );
}

// ---------------------------------------------------------------- photo

export function AvatarEditor({ current, initials }: { current: string | null; initials: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose a photo (JPEG, PNG or WebP).");
    try {
      const blob = await toAvatarJpeg(file);
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch {
      setError("That photo couldn't be opened. Try a JPEG or PNG.");
    }
  }

  function save() {
    if (!preview) return;
    const fd = new FormData();
    fd.append("photo", new File([preview.blob], "avatar.jpg", { type: "image/jpeg" }));
    start(async () => {
      const res = await uploadAvatar(fd);
      if (res.error) return setError(res.error);
      setPreview(null);
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await removeAvatar();
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }

  const shown = preview?.url ?? current;
  return (
    <div className="avatar-editor">
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt="Your profile photo" className="avatar avatar-xl" />
      ) : (
        <span className="avatar avatar-xl" aria-hidden="true">{initials}</span>
      )}
      <div className="avatar-actions">
        <input ref={input} type="file" accept="image/*" onChange={onPick} hidden />
        {preview ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save photo"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPreview(null)} disabled={pending}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-sm" onClick={() => input.current?.click()} disabled={pending}>
              {current ? "Change photo" : "Add a photo"}
            </button>
            {current && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={remove} disabled={pending}>
                Remove
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- name and email

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(updateName, empty);
  return (
    <form className="form flush" action={action}>
      <div className="field">
        <label htmlFor="fullName">Name</label>
        <input id="fullName" name="fullName" defaultValue={current} autoComplete="name" required maxLength={80} />
      </div>
      <Feedback state={state} />
      <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save name"}</button>
    </form>
  );
}

export function EmailForm({ current, pending: pendingEmail }: { current: string; pending: string | null }) {
  const [state, action, pending] = useActionState(changeEmail, empty);
  return (
    <form className="form flush" action={action}>
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" defaultValue={current} autoComplete="email" required />
      </div>
      {pendingEmail && !state.success && (
        <p className="hint">Waiting for confirmation of <b>{pendingEmail}</b>. Check both inboxes.</p>
      )}
      <Feedback state={state} />
      <button className="btn" type="submit" disabled={pending}>{pending ? "Sending…" : "Change email"}</button>
    </form>
  );
}

// ---------------------------------------------------------------- two-step verification

type Factor = { id: string; name: string; added: string };

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Wrenchy recovery codes\nEach code works once. Keep them somewhere safe, away from your phone.\n\n${codes.join("\n")}\n`;

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "wrenchy-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="recovery" role="region" aria-label="Your recovery codes">
      <p className="recovery-lead">
        <b>Save your recovery codes.</b> If you lose your phone, one of these gets you back in. Each works once,
        and this is the only time they&apos;re shown.
      </p>
      <ul className="code-grid">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="btn-row">
        <button type="button" className="btn btn-sm" onClick={download}>Download</button>
        <button type="button" className="btn btn-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I&apos;ve saved these somewhere safe
      </label>
      <button type="button" className="btn btn-primary" disabled={!saved} onClick={onDone}>Done</button>
    </div>
  );
}

function CodeField({ id, label }: { id: string; label: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name="code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
    </div>
  );
}

export function TwoFactorSection({ factors, codesLeft, recovered }: { factors: Factor[]; codesLeft: number; recovered: boolean }) {
  const router = useRouter();
  const enabled = factors.length > 0;
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, start] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(confirmTwoFactor, empty);
  const [regenState, regenAction, regenerating] = useActionState(regenerateRecoveryCodes, empty);
  const [removeState, removeAction, removing] = useActionState(removeAuthenticator, empty);
  const [disableState, disableAction, disabling] = useActionState(disableTwoFactor, empty);

  useEffect(() => {
    if (confirmState.success) {
      setSetup(null);
      if (confirmState.codes) setCodes(confirmState.codes);
      router.refresh();
    }
  }, [confirmState, router]);
  useEffect(() => { if (regenState.codes) setCodes(regenState.codes); }, [regenState]);
  useEffect(() => { if (removeState.success || disableState.success) router.refresh(); }, [removeState, disableState, router]);

  function begin() {
    setStartError(null);
    start(async () => {
      const res = await startTwoFactor();
      if (res.error || !res.factorId) return setStartError(res.error ?? "Couldn't start set-up.");
      setSetup({ factorId: res.factorId, qr: res.qr!, secret: res.secret! });
    });
  }

  // Codes on screen take over the section until they're acknowledged.
  if (codes) {
    return <RecoveryCodes codes={codes} onDone={() => { setCodes(null); router.refresh(); }} />;
  }

  if (setup) {
    return (
      <div className="stack">
        <ol className="steps">
          <li>Open an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password{enabled ? " on your backup device" : ""}.</li>
          <li>Scan this code, or enter the key below by hand.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR code for your authenticator app" className="qr" width={180} height={180} />
        <p className="hint">Key: <code className="secret">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code></p>
        <form className="form flush" action={confirmAction}>
          <input type="hidden" name="factorId" value={setup.factorId} />
          <CodeField id="setup-code" label="Then enter the 6-digit code it shows" />
          <Feedback state={confirmState} />
          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={confirming}>
              {confirming ? "Checking…" : enabled ? "Add authenticator" : "Turn on"}
            </button>
            <button className="btn" type="button" onClick={() => setSetup(null)}>Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="stack">
        {recovered && (
          <p className="notice">
            You signed in with a recovery code, so your old authenticator was removed and other devices were
            signed out. Set up two-step verification again below.
          </p>
        )}
        <div className="row flush-row">
          <div>
            <div className="row-label">Two-step verification</div>
            <div className="row-note">Protect your account and payments with a code from your phone.</div>
          </div>
          <span className="pill warn">Off</span>
        </div>
        {disableState.success && <p className="success-text">{disableState.success}</p>}
        {startError && <p className="error-text">{startError}</p>}
        <button className="btn btn-primary" type="button" onClick={begin} disabled={starting}>
          {starting ? "Starting…" : "Set up two-step verification"}
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row flush-row">
        <div>
          <div className="row-label">Two-step verification</div>
          <div className="row-note">A code from your authenticator app is needed at every log in.</div>
        </div>
        <span className="pill ok">On</span>
      </div>
      {confirmState.success && !confirmState.codes && <p className="success-text">{confirmState.success}</p>}

      <div>
        <div className="row-label small">Your authenticators</div>
        <ul className="factor-list">
          {factors.map((f) => (
            <li key={f.id}>
              <span>
                <b>{f.name}</b>
                <span className="row-note">Added {f.added}</span>
              </span>
              {factors.length > 1 && (
                <details className="disclosure inline">
                  <summary>Remove</summary>
                  <form className="form flush" action={removeAction}>
                    <input type="hidden" name="factorId" value={f.id} />
                    <CodeField id={`rm-${f.id}`} label="Current code from any authenticator" />
                    <button className="btn btn-sm" type="submit" disabled={removing}>{removing ? "Removing…" : "Remove"}</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
        <Feedback state={removeState} />
        {factors.length < 3 && (
          <>
            {startError && <p className="error-text">{startError}</p>}
            <button className="btn btn-sm" type="button" onClick={begin} disabled={starting}>
              {starting ? "Starting…" : "Add a backup authenticator"}
            </button>
            <p className="hint" style={{ marginTop: 6 }}>A second device, such as a tablet or password manager, means a lost phone doesn&apos;t lock you out.</p>
          </>
        )}
      </div>

      <div className="row flush-row">
        <div>
          <div className="row-label small">Recovery codes</div>
          <div className="row-note">{codesLeft} of 10 left. Each gets you in once if you lose every authenticator.</div>
        </div>
        <span className={`pill ${codesLeft > 3 ? "ok" : codesLeft > 0 ? "warn" : "fail"}`}>{codesLeft}</span>
      </div>
      <details className="disclosure">
        <summary>Create new recovery codes</summary>
        <form className="form flush" action={regenAction}>
          <p className="hint">Your current codes stop working as soon as new ones are created.</p>
          <CodeField id="regen-code" label="Current code from your app" />
          <Feedback state={regenState} />
          <button className="btn btn-sm" type="submit" disabled={regenerating}>{regenerating ? "Creating…" : "Create new codes"}</button>
        </form>
      </details>

      <details className="disclosure">
        <summary>Turn off two-step verification</summary>
        <form className="form flush" action={disableAction}>
          <CodeField id="disable-code" label="Current code from your app" />
          <Feedback state={disableState} />
          <button className="btn btn-danger" type="submit" disabled={disabling}>{disabling ? "Turning off…" : "Turn off"}</button>
        </form>
      </details>
    </div>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="error-text" role="alert">{state.error}</p>;
  if (state.success) return <p className="success-text" role="status">{state.success}</p>;
  return null;
}
