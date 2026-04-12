type PluginAction = 'enable' | 'disable' | 'uninstall'
type MarketplaceAction = 'update' | 'remove'

export type ViewState =
  | { type: 'menu' }
  | { type: 'help' }
  | { type: 'validate'; path?: string }
  | { type: 'marketplace-list' }
  | { type: 'marketplace-menu' }
  | {
      type: 'discover-plugins'
      targetPlugin?: string
    }
  | {
      type: 'browse-marketplace'
      targetMarketplace?: string
      targetPlugin?: string
    }
  | {
      type: 'manage-plugins'
      targetPlugin?: string
      targetMarketplace?: string
      action?: PluginAction
    }
  | {
      type: 'add-marketplace'
      initialValue?: string
    }
  | {
      type: 'manage-marketplaces'
      targetMarketplace?: string
      action?: MarketplaceAction
    }

export type PluginSettingsProps = {
  onComplete: (message?: string) => void
  args?: string
  showMcpRedirectMessage?: boolean
}

