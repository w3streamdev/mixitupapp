export interface TenantUserPlatformData {
  Platform: string;
  ID: string | null;
  Username: string | null;
  DisplayName: string | null;
  AvatarLink: string | null;
  SubscriberBadgeLink: string | null;
  RoleBadgeLink: string | null;
  SpecialtyBadgeLink: string | null;
  Roles: string[];
}

export interface TenantUserContract {
  ID: string;
  LastActivity: Date | null;
  LastUpdated: Date | null;
  OnlineViewingMinutes: number;
  CustomTitle: string | null;
  IsSpecialtyExcluded: boolean;
  Notes: string | null;
  PlatformData: Record<string, TenantUserPlatformData>;
}
