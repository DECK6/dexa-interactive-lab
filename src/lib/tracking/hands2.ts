import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Vec2 } from '../math/quad'

export type { Vec2 }

/** Landmark indices of the five fingertips, thumb first. */
export const FINGERTIPS = [4, 8, 12, 16, 20] as const
/** The joint below each fingertip (thumb IP, then the PIPs), thumb first. */
export const FINGER_PIPS = [3, 6, 10, 14, 18] as const
export const PALM = {
  wrist: 0,
  thumbCmc: 1,
  indexMcp: 5,
  middleMcp: 9,
  ringMcp: 13,
  pinkyMcp: 17,
} as const

/** landmarks: 21 points, mirrored x, video-normalized (0..1). label: MediaPipe handedness name, raw. */
export interface HandData {
  landmarks: Vec2[]
  label: string
  score: number
}

/** hands are sorted by wrist x ascending — index 0 is the hand on the viewer's left. */
export interface TwoHands {
  hands: HandData[]
  present: boolean
}

export async function createTwoHandTracker(
  video: HTMLVideoElement,
): Promise<{ read(): TwoHands; dispose(): void }> {
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

  const absent: TwoHands = { hands: [], present: false }
  let state: TwoHands = absent
  let lastVideoTime = -1

  return {
    read(): TwoHands {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return state
      lastVideoTime = video.currentTime

      const res = landmarker.detectForVideo(video, performance.now())
      const hands: HandData[] = []
      res.landmarks.forEach((lm, i) => {
        if (lm.length < 21) return
        const cat = res.handedness[i]?.[0]
        hands.push({
          // Mirror x so each hand tracks the viewer's own left/right.
          landmarks: lm.map((p) => ({ x: 1 - p.x, y: p.y })),
          label: cat?.categoryName ?? '',
          score: cat?.score ?? 0,
        })
      })
      hands.sort((a, b) => a.landmarks[PALM.wrist].x - b.landmarks[PALM.wrist].x)

      state = hands.length ? { hands, present: true } : absent
      return state
    },
    dispose(): void {
      landmarker.close()
    },
  }
}
