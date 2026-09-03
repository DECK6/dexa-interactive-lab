import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

/**
 * Person-confidence mask from the selfie segmenter.
 *
 * `data` is row-major in the video's own orientation (NOT mirrored); use
 * `sample(u, v)` with mirrored, video-normalized coordinates — the same
 * convention the hand trackers use — when you need a CPU lookup.
 */
export interface PersonMask {
  data: Float32Array | null
  width: number
  height: number
  present: boolean
  /** Fraction of mask pixels with confidence above 0.5. */
  coverage: number
  sample(u: number, v: number): number
}

const PRESENT_COVERAGE = 0.02

export async function createSegmenter(
  video: HTMLVideoElement,
): Promise<{ read(): PersonMask; dispose(): void }> {
  const base = import.meta.env.BASE_URL
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`)
  const options = {
    baseOptions: { modelAssetPath: `${base}models/selfie_segmenter.tflite`, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  }

  let segmenter: ImageSegmenter
  try {
    segmenter = await ImageSegmenter.createFromOptions(fileset, options)
  } catch {
    segmenter = await ImageSegmenter.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' as const },
    })
  }

  // The single-label selfie model yields one mask that is the person
  // probability; a two-label model puts the person on the non-background index.
  const labels = segmenter.getLabels()
  let personIndex = 0
  if (labels.length > 1) {
    const i = labels.findIndex((l) => !/background/i.test(l))
    personIndex = i >= 0 ? i : labels.length - 1
  }

  const mask: PersonMask = {
    data: null,
    width: 0,
    height: 0,
    present: false,
    coverage: 0,
    sample(u: number, v: number): number {
      const d = mask.data
      if (!d) return 0
      const x = Math.min(mask.width - 1, Math.max(0, Math.round((1 - u) * (mask.width - 1))))
      const y = Math.min(mask.height - 1, Math.max(0, Math.round(v * (mask.height - 1))))
      return d[y * mask.width + x]
    },
  }
  let lastVideoTime = -1

  return {
    read(): PersonMask {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return mask
      lastVideoTime = video.currentTime

      segmenter.segmentForVideo(video, performance.now(), (result) => {
        const m = result.confidenceMasks?.[personIndex] ?? result.confidenceMasks?.[0]
        if (!m) return
        // The callback's data is only valid until it returns — copy it.
        const src = m.getAsFloat32Array()
        if (!mask.data || mask.data.length !== src.length) mask.data = new Float32Array(src.length)
        mask.data.set(src)
        mask.width = m.width
        mask.height = m.height

        let hit = 0
        let n = 0
        for (let i = 0; i < src.length; i += 7) {
          n++
          if (src[i] > 0.5) hit++
        }
        mask.coverage = n ? hit / n : 0
      })
      mask.present = mask.coverage > PRESENT_COVERAGE
      return mask
    },
    dispose(): void {
      segmenter.close()
    },
  }
}
