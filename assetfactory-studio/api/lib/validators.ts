import { z } from 'zod';

export const AssetJobRequestValidator = z.object({
  version: z.literal('1.0'),
  preset: z.enum(['marketing-kit', 'story-video', 'capcut-pack', 'social-carousel']).optional(),
  prompt: z.object({
    title: z.string().optional(),
    description: z.string(),
    tone: z.string().optional(),
    duration: z.number().optional(),
    platform: z.enum(['tiktok', 'instagram', 'youtube', 'capcut']).optional(),
    language: z.string().optional(),
  }),
  assets: z.object({
    video: z.boolean().optional(),
    images: z.boolean().optional(),
    audio: z.boolean().optional(),
    storyboard: z.boolean().optional(),
    subtitles: z.boolean().optional(),
  }),
  deterministic: z.boolean().optional(),
});
