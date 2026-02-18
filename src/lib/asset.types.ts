
export interface Asset {
    id: string;
    tenantId: string;
    creatorId: string;
    assetType: string;
    templateId: string;
    generationParams: any; // This will be the AssetFactoryInput_V1
    status: "creating" | "available" | "archived" | "failed";
    version: number;
    lineageParentId?: string;
    createdAt: Date;
    updatedAt: Date;
    hash: string;
}

export interface AssetVersion {
    id: string;
    assetId: string;
    version: number;
    generationParams: any;
    createdAt: Date;
    hash: string;
}

export interface AssetTemplate {
    id: string;
    tenantId: string;
    name: string;
    description: string;
    assetType: string;
    schema: any; // JSON schema for the generationParams
    createdAt: Date;
    updatedAt: Date;
}

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
