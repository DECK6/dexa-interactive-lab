import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Vec2 } from '../math/quad'

export type { Vec2 }

/** Landmark indices of the five fingertips, thumb first. */
export const FINGERTIPS = [4, 8, 12, 16, 20] as const

/** landmarks: all 21 points, mirrored x, video-normalized (0..1). */
export interface HandPose {
  landmarks: Vec2[] | null
  present: boolean
}

export async function createHandPoseTracker(
  video: HTMLVideoElement,
): Promise<{ read(): HandPose; dispose(): void }> {
  const base = import.meta.env.BASE_URL
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`)
  const options = {
    baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numHands: 1,
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

  const absent: HandPose = { landmarks: null, present: false }
  let pose: HandPose = absent
  let lastVideoTime = -1

  return {
    read(): HandPose {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return pose
      lastVideoTime = video.currentTime

      const hands = landmarker.detectForVideo(video, performance.now()).landmarks
      const lm = hands[0]
      if (!lm || lm.length < 21) {
        pose = absent
        return pose
      }

      // Mirror x so the hand tracks the viewer's own left/right.
      pose = { landmarks: lm.map((p) => ({ x: 1 - p.x, y: p.y })), present: true }
      return pose
    },
    dispose(): void {
      landmarker.close()
    },
  }
}
