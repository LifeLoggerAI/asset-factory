import { NextResponse } from 'next/server';
import { PresetV1 } from '../../../../schemas/preset';

const presets: PresetV1[] = [
  {
    name: 'Feel-Good Ad',
    description: 'A short, uplifting ad for social media.',
    input: {
      storyStructure: 'problem_solution',
      tone: 'inspirational',
      pacing: 'fast',
      durationSeconds: 15,
      platformTargets: ['tiktok', 'instagram_reels'],
    }
  },
  {
    name: 'Cinematic Trailer',
    description: 'A dramatic and exciting trailer.',
    input: {
      storyStructure: 'cinematic',
      tone: 'dramatic',
      pacing: 'medium',
      durationSeconds: 60,
      visualStyle: 'cinematic_anime',
    }
  },
  {
    name: 'Educational Explainer',
    description: 'A clear and concise explainer video.',
    input: {
      storyStructure: 'listicle',
      tone: 'educational',
      pacing: 'slow',
      durationSeconds: 120,
      voiceProfile: 'clear_female_presenter',
    }
  }
];

export async function GET() {
  return NextResponse.json(presets);
}
