
export interface AssetFactoryInput_V1 {
    story_structure: "problem-solution" | "hero-journey" | "listicle" | "cinematic";
    audience_type: "b2b" | "b2c" | "investor" | "internal";
    tone: "professional" | "inspirational" | "humorous" | "urgent";
    duration_seconds: number;
    platform_targets: ("instagram_reels" | "youtube_shorts" | "linkedin_video" | "tiktok")[];
    visual_style: "modern-minimal" | "cinematic-documentary" | "corporate-clean" | "vibrant-energetic";
    voice_profile: string; // e.g., "male-deep-authoritative"
    pacing: "slow" | "medium" | "fast";
    call_to_action?: string;
    brand_guidelines?: {
        colors: string[];
        fonts: string[];
        logo_url?: string;
    };
    compliance_rules?: {
        disclaimers: string[];
        required_text: string[];
    };
}

export interface Job {
    id: string;
    projectId: string;
    userId: string;
    input_schema_version: string;
    pipeline_version: string;
    seed: number;
    deterministic_hash: string;
    status: "queued" | "processing" | "complete" | "failed";
    output_manifest_id?: string;
    created_at: Date;
    completed_at?: Date;
    cost_estimate_usd: number;
}

export interface User {
    id: string;
    email: string;
    role: "admin" | "user";
    created_at: Date;
}
