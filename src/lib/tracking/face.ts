import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { OneEuroVec3 } from '../math/one-euro'
import { getScreenWidthM } from '../config'

/** Screen-centred metres: x right+, y up+, z out of the screen toward the viewer (always > 0). */
export interface HeadPose {
  x: number
  y: number
  z: number
  present: boolean
}

const IPD_M = 0.063 // adult interpupillary distance
const HFOV_FACTOR = 0.866 // focal length in px for an assumed 60° horizontal FOV
const EYE_L = 33 // outer corner, left eye in image
const EYE_R = 263 // outer corner, right eye in image

export async function createFaceTracker(
  video: HTMLVideoElement,
): Promise<{ read(): HeadPose; dispose(): void }> {
  const base = import.meta.env.BASE_URL
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`)
  const options = {
    baseOptions: { modelAssetPath: `${base}models/face_landmarker.task`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
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

  const smooth = new OneEuroVec3(1.2, 0.02)
  let pose: HeadPose = { x: 0, y: 0, z: 0.6, present: false }
  let lastVideoTime = -1

  return {
    read(): HeadPose {
      // Detection is the expensive part: only run it when a new frame arrived.
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return pose
      lastVideoTime = video.currentTime

      const res = landmarker.detectForVideo(video, performance.now())
      const lm = res.faceLandmarks[0]
      if (!lm) {
        pose = { ...pose, present: false }
        return pose
      }

      const w = video.videoWidth
      const h = video.videoHeight
      const focalPx = HFOV_FACTOR * w

      const ax = lm[EYE_L].x * w
      const ay = lm[EYE_L].y * h
      const bx = lm[EYE_R].x * w
      const by = lm[EYE_R].y * h
      const eyeDistPx = Math.hypot(bx - ax, by - ay)
      const z = (IPD_M * focalPx) / eyeDistPx

      // Horizontal sign chosen by feel on the live installation (user-tested):
      // parallax must run opposite to the mirrored-x reading.
      const mx = (lm[EYE_L].x + lm[EYE_R].x) / 2
      const my = (lm[EYE_L].y + lm[EYE_R].y) / 2
      const screenW = getScreenWidthM()
      const x = (mx - 0.5) * screenW
      const y = (0.5 - my) * screenW * (h / w)

      const s = smooth.filter({ x, y, z }, performance.now() / 1000)
      pose = { x: s.x, y: s.y, z: s.z, present: true }
      return pose
    },
    dispose(): void {
      landmarker.close()
    },
  }
}
