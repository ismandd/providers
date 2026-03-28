import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

interface VixMedia {
  id: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
}

interface ScrapeResult {
  url: string;
  quality: string;
  type: 'hls';
}

export const vixScraper = {
  id: 'vixsrc',
  name: 'VixSrc',
  rank: 120,

  /**
   * Main scraping logic
   */
  async scrape(media: VixMedia): Promise<ScrapeResult> {
    const browser: Browser = await puppeteer.launch({
      headless: true, // Set to false for debugging
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page: Page = await browser.newPage();
      let masterLink: string | null = null;

      // 1. Block Ads/Analytics (Replaces uBlock extension)
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        const resourceType = request.resourceType();
        
        // Check for the M3U8 Master Playlist
        if (
          url.includes('/playlist/') &&
          url.includes('token=') &&
          !url.includes('type=audio') &&
          !masterLink
        ) {
          masterLink = url;
          request.continue();
          return;
        }

        // Block typical ad/tracking domains and non-essential assets
        const filters = ['doubleclick', 'adsystem', 'quantserve', 'facebook', 'analytics'];
        if (filters.some(ad => url.includes(ad)) || ['image', 'font'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // 2. Anti-Debugger & Window Pop-up Protection
      await page.evaluateOnNewDocument(() => {
        // Disable debugger traps
        const originalConstructor = window.Function.prototype.constructor;
        (window.Function.prototype.constructor as any) = function() {
          if (arguments[0] === 'debugger') return () => {};
          return originalConstructor.apply(this, arguments);
        };
        // Kill popups
        window.open = () => null;
      });

      // 3. Navigate to Target
      const targetUrl = media.type === 'tv' 
        ? `https://vixsrc.to/tv/${media.id}/${media.season}/${media.episode}`
        : `https://vixsrc.to/movie/${media.id}`;

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 4. Trigger Player Interaction
      // Vix requires a click on the iframe to initiate the token exchange/stream request
      const iframeElement = await page.waitForSelector('iframe', { timeout: 10000 });
      if (iframeElement) {
        const box = await iframeElement.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      }

      // 5. Wait for the Sniffer to catch the link
      const result = await this.waitForLink(20000, () => masterLink);
      
      if (!result) throw new Error('Stream link not captured');

      return {
        url: result,
        quality: 'auto',
        type: 'hls'
      };

    } finally {
      await browser.close().catch(() => {});
    }
  },

  /**
   * Internal polling helper to wait for the network event
   */
  private async waitForLink(timeout: number, checkFn: () => string | null): Promise<string | null> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const link = checkFn();
      if (link) return link;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return null;
  }
};
