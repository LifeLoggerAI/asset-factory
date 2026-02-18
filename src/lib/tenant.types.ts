
export interface Tenant {
    id: string;
    name: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface TenantSettings {
    id: string;
    tenantId: string;
    maxUsers: number;
    maxApiKeys: number;
    allowPublicAssetSharing: boolean;
}

export interface TenantMember {
    id: string;
    tenantId: string;
    userId: string;
    role: "creator" | "admin" | "enterprise_admin";
}
