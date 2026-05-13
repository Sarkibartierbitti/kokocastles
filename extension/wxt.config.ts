import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'kokocastles',
    description: 'BYOK short-form video analysis — sidebar + content script',
    version: '0.2.0',
    permissions: ['storage', 'tabs', 'activeTab', 'unlimitedStorage', 'alarms'],
    host_permissions: [
      'https://www.youtube.com/*',
      'https://m.youtube.com/*',
      'https://www.instagram.com/*',
      'https://www.tiktok.com/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api.mistral.ai/*',
      'https://api.deepseek.com/*',
      'https://api.x.ai/*',
      'https://api.moonshot.ai/*',
      'https://api.z.ai/*',
      'https://openrouter.ai/*',
      'https://api.groq.com/*',
      'https://api.together.xyz/*',
      'https://api.fireworks.ai/*',
      'https://www.googleapis.com/*',
    ],
    sidebar_action: {
      default_title: 'kokocastles',
      default_panel: 'sidebar.html',
      default_icon: { '48': 'icons/icon-48.png' },
    },
    browser_specific_settings: {
      gecko: {
        id: 'kokocastles@local',
        strict_min_version: '115.0',
      },
    },
  },
  srcDir: 'src',
  outDir: '.output',
});
