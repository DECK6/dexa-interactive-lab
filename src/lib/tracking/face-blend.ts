import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { Vec2 } from '../math/quad'

export type { Vec2 }

/** Face-oval landmark loop (MediaPipe FACEMESH_FACE_OVAL), clockwise from the forehead. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const

/** Handy landmark indices. "L"/"R" are the *image's* left/right before mirroring. */
export const FACE_POINTS = {
  noseTip: 1,
  mouthUpper: 13,
  mouthLower: 14,
  mouthLeft: 61,
  mouthRight: 291,
  eyeOuterL: 33,
  eyeOuterR: 263,
  chin: 152,
  forehead: 10,
} as const

/** landmarks: 478 points, mirrored x, video-normalized (0..1). blend: categoryName → 0..1. */
export interface FaceState {
  landmarks: Vec2[] | null
  blend: Record<string, number>
  present: boolean
}

export async function createFaceBlendTracker(
  video: HTMLVideoElement,
): Promise<{ read(): FaceState; dispose(): void }> {
  const base = import.meta.env.BASE_URL
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`)
  const options = {
    baseOptions: { modelAssetPath: `${base}models/face_landmarker.task`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
  }

  let landmarker: FaceLandmarker
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, options)
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' as const },
    })
  }

  const blend: Record<string, number> = {}
  let state: FaceState = { landmarks: null, blend, present: false }
  let lastVideoTime = -1

  return {
    read(): FaceState {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return state
      lastVideoTime = video.currentTime

      const res = landmarker.detectForVideo(video, performance.now())
      const lm = res.faceLandmarks[0]
      if (!lm) {
        state = { landmarks: null, blend, present: false }
        return state
      }

      const cats = res.faceBlendshapes[0]?.categories
      if (cats) for (const c of cats) blend[c.categoryName] = c.score

      // Mirror x so the face tracks the viewer's own left/right.
      state = { landmarks: lm.map((p) => ({ x: 1 - p.x, y: p.y })), blend, present: true }
      return state
    },
    dispose(): void {
      landmarker.close()
    },
  }
}
