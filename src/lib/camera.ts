// getUserMedia wrapper. Everything downstream reads pixels from this <video>;
// no frame ever leaves the page.

export type CameraErrorKind = 'denied' | 'notfound' | 'insecure'

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'CameraError'
  }
}

export async function initCamera(
  video: HTMLVideoElement,
  opts: { width?: number; height?: number } = {},
): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('insecure', 'getUserMedia requires a secure context (https or localhost)')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: opts.width ?? 640 },
        height: { ideal: opts.height ?? 480 },
        facingMode: 'user',
      },
    })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    const kind: CameraErrorKind =
      name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'notfound'
    throw new CameraError(kind, `getUserMedia failed: ${name || String(err)}`)
  }

  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()

  // videoWidth/videoHeight are 0 until metadata lands, and the trackers need them.
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
    })
  }
  return stream
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject
  if (stream instanceof MediaStream) {
    for (const track of stream.getTracks()) track.stop()
  }
  video.srcObject = null
}
