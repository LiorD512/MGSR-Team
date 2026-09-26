/**
 * Google Gemini implementation of ImageGenerationProvider.
 *
 * Uses `gemini-2.5-flash-image` (a.k.a. Nano Banana) — Google's current
 * image-generation/editing model — via the already-installed
 * @google/generative-ai SDK and the existing GEMINI_API_KEY. The model returns
 * image bytes as an inlineData part.
 *
 * Reference images (e.g. a real stadium photo) are passed as additional
 * inlineData parts to steer image-to-image generation.
 */

import type {
  BackgroundGenerationRequest,
  CutoutRequest,
  GeneratedImage,
  ImageGenerationProvider,
  SceneCompositionRequest,
} from '../types';

// Current image-capable model. Kept as a constant so it's a one-line change
// when Google ships the next generation (the provider abstraction means the
// rest of the pipeline is unaffected).
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

export class GeminiImageProvider implements ImageGenerationProvider {
  readonly id = 'gemini:gemini-2.5-flash-image';
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generateBackground(req: BackgroundGenerationRequest): Promise<GeneratedImage> {
    // The 9:16 target is expressed in the prompt; the model does not accept a
    // numeric aspect-ratio arg on this SDK version, so we ask for it explicitly
    // and enforce the final canvas size during compositing.
    const text = `${req.prompt} Output a single ${req.aspectRatio} vertical image.`;
    return this.generate(text, req.referenceImages ?? []);
  }

  async composeScene(req: SceneCompositionRequest): Promise<GeneratedImage> {
    // Single image-to-image composition: the model builds the whole cinematic
    // scene AROUND the real player photos. This is what makes the output look
    // designed rather than a flat pasted cutout.
    const identityGuard =
      'CRITICAL IDENTITY RULE: the player in the first supplied photo is a real person. Preserve his exact face, facial structure, hairline, hair, beard, skin tone, body proportions and current club kit with 100% fidelity. Do NOT beautify, restyle, swap or invent a different-looking footballer. Use the additional supplied photos only as extra reference of the same person.';
    const noTextGuard =
      'Do NOT render any letters, words, numbers, club logos, badges or watermarks anywhere in the image — leave clean negative space at the top and bottom for text to be added later.';
    const text = `${req.prompt} ${identityGuard} ${noTextGuard} Output a single polished ${req.aspectRatio} vertical cinematic artwork.`;

    const refs: GeneratedImage[] = [...req.playerImages];
    if (req.stadium) refs.push(req.stadium);
    return this.generate(text, refs);
  }

  async cutoutPlayer(req: CutoutRequest): Promise<GeneratedImage> {
    // Edit (not regenerate) the real photo: isolate onto transparency while
    // keeping the player's identity byte-for-byte faithful.
    const text = `${req.prompt} Return a single PNG with a fully transparent background. CRITICAL: do not change the person's face, facial structure, hairline, hair, beard, skin tone, body proportions or kit in any way — this must remain the exact same real person from the supplied photograph.`;
    return this.generate(text, [req.image]);
  }

  /** Shared call: prompt + optional inline reference images → first image part. */
  private async generate(text: string, references: GeneratedImage[]): Promise<GeneratedImage> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured — cannot run MATCHDAY image generation.');
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_IMAGE_MODEL });

    const promptParts: Array<
      { text: string } | { inlineData: { data: string; mimeType: string } }
    > = [{ text }];

    for (const ref of references) {
      promptParts.push({
        inlineData: { data: ref.bytes.toString('base64'), mimeType: ref.mimeType },
      });
    }

    const result = await model.generateContent(promptParts);
    const parts = result.response?.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
      if (inline?.data) {
        return {
          bytes: Buffer.from(inline.data, 'base64'),
          mimeType: inline.mimeType || 'image/png',
        };
      }
    }

    const textPart = parts
      .map((p) => (p as { text?: string }).text)
      .filter(Boolean)
      .join(' ');
    throw new Error(`Gemini returned no image${textPart ? `: ${textPart.slice(0, 200)}` : '.'}`);
  }
}

/** Default provider factory. Swap this to change the active AI backend. */
export function createDefaultImageProvider(): ImageGenerationProvider {
  return new GeminiImageProvider();
}
