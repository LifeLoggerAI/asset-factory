export interface AssetFactoryInputV1 {
  storyStructure: "problem_solution" | "hero_journey" | "listicle" | "cinematic";
  audienceType: string;
  tone: string;
  durationSeconds: number;
  platformTargets: string[];
  visualStyle: string;
  voiceProfile: string;
  pacing: "slow" | "medium" | "fast";
  callToAction?: string;
  brandGuidelines?: {
    colors: string[];
    fonts: string[];
    logoUrl?: string;
  };
}
