// The setup guides live on the website. Opened in the default browser through
// the preload's openExternal, which main limits to https://miditrumpetguy.com/.
export const SETUP_GUIDES_URL = 'https://miditrumpetguy.com/pages/setup'

export function openSetupGuides(): void {
  window.electronAPI?.openExternal(SETUP_GUIDES_URL).catch(() => {})
}
