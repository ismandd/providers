import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

// Types to match your provider system
interface Sourcerer {
  id: string;
  name: string;
  rank: number;
  flags: string[];
  disabled?: boolean;
}

const BlockedDomains = [
  'analytics.vixcloud.co',
  'doubleclick.net',
  'google-analytics.com',
  'quantserve.com',
  'facebook.net',
  'gstatic.com'
];

export const vixsrcScraper: Sourcerer & { scrape: Function } = {
  id: 'vixsrc',
  name: 'VixSrc',
  rank: 120, // High rank as it's a direct provider
  flags: ['browser-sniffer'],

  async scrape(media: { id: string; type: 'movie' | 'tv'; season?: number; episode?: number }) {
    const browser: Browser = await puppeteer.launch({
      headless: true, // "new" is now default in latest puppeteer
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page: Page = await browser.newPage();
      let capturedUrl: string | null = null;

      // 1. Setup Request Interception (Replaces uBlock)
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        
        // Target the master playlist with the token
        if (url.includes('.m3u8') && url.includes('token=') && !capturedUrl) {
          capturedUrl = url;
          req.continue();
          return;
        }

        // Block ads, analytics, and heavy media to save resources
        const isAds = BlockedDomains.some(d => url.includes(d));
        if (isAds || ['image', 'font', 'media'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // 2. Anti-Debugger Protection
      await page.evaluateOnNewDocument(() => {
        const originalConstructor = window.Function.prototype.constructor;
        (window.Function.prototype.constructor as any) = function() {
          if (arguments[0] === 'debugger') return () => {};
          return originalConstructor.apply(this, arguments);
        };
        window.open = () => null; // Block popups
      });

      // 3. Navigate
      const url = media.type === 'tv' 
        ? `https://vixsrc.to/tv/${media.id}/${media.season}/${media.episode}`
        : `https://vixsrc.to/movie/${media.id}`;

      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // 4. Trigger Interaction (Required for Vix to generate token)
      // Look for the JWPlayer play button container found in your HTML snippet
      const playButton = await page.waitForSelector('.jw-display-icon-container', { timeout: 10000 });
      if (playButton) {
        await playButton.click();
      }

      // 5. Polling for captured URL
      for (let i = 0; i < 30; i++) { // Max 15 seconds
        if (capturedUrl) break;
        await new Promise(r => setTimeout(r, 500));
      }

      return capturedUrl ? {
        url: capturedUrl,
        quality: 'auto',
        type: 'hls',
        headers: {
          'Referer': 'https://vixsrc.to/',
          'User-Agent': await browser.userAgent()
        }
      } : null;

    } catch (err) {
      console.error(`[VixSrc] Error: ${err.message}`);
      return null;
    } finally {
      await browser.close().catch(() => {});
    }
  }
};
