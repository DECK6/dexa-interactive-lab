import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { orderCorners } from '../math/quad'
import type { Vec2 } from '../math/quad'

export type { Vec2 }

/** corners: mirrored video-normalized coords (0..1), ordered TL, TR, BR, BL. */
export interface FingerFrame {
  corners: [Vec2, Vec2, Vec2, Vec2] | null
  roll: number
  present: boolean
}

const THUMB_TIP = 4
const INDEX_TIP = 8

export async function createHandTracker(
  video: HTMLVideoElement,
): Promise<{ read(): FingerFrame; dispose(): void }> {
  const base = import.meta.env.BASE_URL
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`)
  const options = {
    baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numHands: 2,
  }

  let landmarker: HandLandmarker
  try {
    landmarker = await HandLandmarker.createFromOptions(fileset, options)
  } catch {
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' as const },
    })
  }

  const absent: FingerFrame = { corners: null, roll: 0, present: false }
  let frame: FingerFrame = absent
  let lastVideoTime = -1

  return {
    read(): FingerFrame {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return frame
      lastVideoTime = video.currentTime

      const hands = landmarker.detectForVideo(video, performance.now()).landmarks
      if (hands.length !== 2) {
        frame = absent
        return frame
      }

      // Mirror x so the frame tracks the viewer's own left/right.
      const tips = hands.map((lm) => {
        const thumb = lm[THUMB_TIP]
        const index = lm[INDEX_TIP]
        if (!thumb || !index) return null
        return {
          thumb: { x: 1 - thumb.x, y: thumb.y },
          index: { x: 1 - index.x, y: index.y },
        }
      })
      if (tips.some((t) => t === null)) {
        frame = absent
        return frame
      }

      const pair = tips as { thumb: Vec2; index: Vec2 }[]
      const mid = pair.map((t) => ({ x: (t.thumb.x + t.index.x) / 2, y: (t.thumb.y + t.index.y) / 2 }))
      const [left, right] = mid[0].x <= mid[1].x ? [mid[0], mid[1]] : [mid[1], mid[0]]

      frame = {
        corners: orderCorners([pair[0].thumb, pair[0].index, pair[1].thumb, pair[1].index]),
        roll: Math.atan2(right.y - left.y, right.x - left.x),
        present: true,
      }
      return frame
    },
    dispose(): void {
      landmarker.close()
    },
  }
}
