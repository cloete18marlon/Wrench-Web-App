"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  changeEmail,
  confirmTwoFactor,
  disableTwoFactor,
  removeAvatar,
  startTwoFactor,
  updateName,
  uploadAvatar,
  type FormState,
} from "./actions";

const empty: FormState = {};
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

export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, start] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(confirmTwoFactor, empty);
  const [disableState, disableAction, disabling] = useActionState(disableTwoFactor, empty);

  useEffect(() => {
    if (confirmState.success) { setSetup(null); router.refresh(); }
  }, [confirmState.success, router]);
  useEffect(() => {
    if (disableState.success) router.refresh();
  }, [disableState.success, router]);

  function begin() {
    setStartError(null);
    start(async () => {
      const res = await startTwoFactor();
      if (res.error || !res.factorId) return setStartError(res.error ?? "Couldn't start set-up.");
      setSetup({ factorId: res.factorId, qr: res.qr!, secret: res.secret! });
    });
  }

  if (enabled) {
    return (
      <div className="stack">
        <div className="row flush-row">
          <div>
            <div className="row-label">Two-step verification</div>
            <div className="row-note">A code from your authenticator app is needed at every log in.</div>
          </div>
          <span className="pill ok">On</span>
        </div>
        {confirmState.success && <p className="success-text">{confirmState.success}</p>}
        <details className="disclosure">
          <summary>Turn off two-step verification</summary>
          <form className="form flush" action={disableAction}>
            <div className="field">
              <label htmlFor="disable-code">Current code from your app</label>
              <input id="disable-code" name="code" className="code-input" inputMode="numeric"
                     autoComplete="one-time-code" maxLength={7} required />
            </div>
            <Feedback state={disableState} />
            <button className="btn btn-danger" type="submit" disabled={disabling}>
              {disabling ? "Turning off…" : "Turn off"}
            </button>
          </form>
        </details>
      </div>
    );
  }

  if (setup) {
    return (
      <div className="stack">
        <ol className="steps">
          <li>Open an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
          <li>Scan this code, or enter the key below by hand.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR code for your authenticator app" className="qr" width={180} height={180} />
        <p className="hint">
          Key: <code className="secret">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
        </p>
        <form className="form flush" action={confirmAction}>
          <input type="hidden" name="factorId" value={setup.factorId} />
          <div className="field">
            <label htmlFor="setup-code">Then enter the 6-digit code it shows</label>
            <input id="setup-code" name="code" className="code-input" inputMode="numeric"
                   autoComplete="one-time-code" maxLength={7} required autoFocus />
          </div>
          <Feedback state={confirmState} />
          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={confirming}>
              {confirming ? "Checking…" : "Turn on"}
            </button>
            <button className="btn" type="button" onClick={() => setSetup(null)}>Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="stack">
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

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="error-text" role="alert">{state.error}</p>;
  if (state.success) return <p className="success-text" role="status">{state.success}</p>;
  return null;
}
