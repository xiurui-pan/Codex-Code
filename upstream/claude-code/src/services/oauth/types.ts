export type SubscriptionType =
  | 'max'
  | 'pro'
  | 'team'
  | 'enterprise'

export type RateLimitTier = string

export type BillingType =
  | 'stripe_subscription'
  | 'stripe_subscription_contracted'
  | 'apple_subscription'
  | 'google_play_subscription'
  | string

export type OAuthProfileResponse = {
  account?: {
    uuid?: string
    email?: string
    display_name?: string | null
    created_at?: string
  }
  organization?: {
    uuid?: string
    organization_type?: string | null
    rate_limit_tier?: RateLimitTier | null
    has_extra_usage_enabled?: boolean | null
    billing_type?: BillingType | null
    subscription_created_at?: string | null
  }
}

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
  account?: {
    uuid: string
    email_address: string
  }
  organization?: {
    uuid?: string
  }
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number | null
  scopes?: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: {
    uuid: string
    emailAddress: string
    organizationUuid?: string
  }
}

export type UserRolesResponse = {
  organization_role?: string | null
  workspace_role?: string | null
  organization_name?: string | null
}

export type ReferrerRewardInfo = {
  amount_minor_units: number
  currency: string
}

export type ReferralCampaign = 'claude_code_guest_pass' | string

export type ReferralEligibilityResponse = {
  eligible: boolean
  remaining_passes?: number | null
  referrer_reward?: ReferrerRewardInfo | null
  referral_code_details?: {
    referral_link?: string | null
    campaign?: string | null
  } | null
}

export type ReferralRedemptionsResponse = {
  limit?: number | null
  redemptions?: Array<unknown> | null
}
