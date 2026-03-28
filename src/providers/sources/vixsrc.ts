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

// Internal polling helper
async function waitForLink(timeout: number, checkFn: () => string | null): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const link = checkFn();
    if (link) return link;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}

export const vixsrcScraper = { // Renamed to vixsrcScraper to match all.ts
  id: 'vixsrc',
  name: 'VixSrc',
  rank: 120,

  async scrape(media: VixMedia): Promise<ScrapeResult> {
    const browser: Browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page: Page = await browser.newPage();
      let masterLink: string | null = null;

      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
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

        const filters = ['doubleclick', 'adsystem', 'quantserve', 'facebook', 'analytics'];
        if (filters.some(ad => url.includes(ad)) || ['image', 'font'].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });

      await page.evaluateOnNewDocument(() => {
        const originalConstructor = window.Function.prototype.constructor;
        (window.Function.prototype.constructor as any) = function(...args: any[]) {
          if (args[0] === 'debugger') return () => {};
          return originalConstructor.apply(this, args);
        };
        window.open = () => null;
      });

      const targetUrl = media.type === 'tv' 
        ? `https://vixsrc.to/tv/${media.id}/${media.season}/${media.episode}`
        : `https://vixsrc.to/movie/${media.id}`;

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const iframeElement = await page.waitForSelector('iframe', { timeout: 10000 });
      if (iframeElement) {
        const box = await iframeElement.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      }

      const result = await waitForLink(20000, () => masterLink);
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
};
