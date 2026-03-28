import { load } from 'cheerio';
import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://vixsrc.to';

async function comboScrape(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const targetUrl = ctx.media.type === 'tv' 
    ? `${baseUrl}/embed/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`
    : `${baseUrl}/embed/movie/${ctx.media.tmdbId}`;

  // 1. Fetch the embed page
  const pageContent = await ctx.proxiedFetcher(targetUrl, {
    headers: {
      Referer: baseUrl,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.34 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.34',
    }
  });

  const $ = load(pageContent);
  
  // 2. Look for the stream URL in the script tags (mimicking the sniffer)
  // VixSrc often hides the "master" playlist in a JSON config or a window variable
  let masterLink: string | null = null;

  $('script').each((_, script) => {
    const content = $(script).html() || '';
    
    // Look for the pattern your sniffer caught: /playlist/ + token=
    const regex = /["'](https?:\/\/[^"']+\/playlist\/[^"']+token=[^"']+)["']/;
    const match = content.match(regex);
    if (match && !masterLink) {
      masterLink = match[1];
    }
  });

  // 3. Fallback: If not in scripts, check if it's hidden in an AJAX call logic
  if (!masterLink) {
     // Some versions of VixSrc require a POST to /ajax/embed/getSources
     // If the direct link isn't in the HTML, we'd add an extra fetch here.
     throw new NotFoundError('VixSrc stream link not found in page source');
  }

  // 4. Construct the proxied stream object
  // We use your worker to bypass the Referer/Origin checks VixSrc performs
  const proxyBase = "https://simple-proxy.is-mand.workers.dev";
  const headers = encodeURIComponent(JSON.stringify({
    Origin: baseUrl,
    Referer: `${baseUrl}/`
  }));

  // We route it through the m3u8-proxy on your worker
  const proxiedPlaylist = `${proxyBase}/m3u8-proxy?url=${encodeURIComponent(masterLink)}&headers=${headers}`;

  return {
    embeds: [],
    stream: [
      {
        id: 'vixsrc-direct',
        type: 'hls',
        playlist: proxiedPlaylist,
        flags: [flags.CORS_ALLOWED],
        captions: [], // Vix usually embeds subs in the HLS, but you can add a caption scraper here later
      },
    ],
  };
}

export const vixsrcScraper = makeSourcerer({
  id: 'vixsrc',
  name: 'VixSrc',
  rank: 120,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScrape,
  scrapeShow: comboScrape,
});
