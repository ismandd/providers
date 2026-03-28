import { load } from 'cheerio';
import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';

const baseUrl = 'https://vixsrc.to';

async function comboScrape(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const targetUrl = ctx.media.type === 'tv' 
    ? `${baseUrl}/embed/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`
    : `${baseUrl}/embed/movie/${ctx.media.tmdbId}`;

  // Fetch the page content via the proxy
  const pageContent = await ctx.proxiedFetcher(targetUrl);
  const $ = load(pageContent);
  
  // Look for the source iframe or the specific player data
  const iframeUrl = $('iframe').attr('src');
  
  if (!iframeUrl) throw new Error('No stream found');

  return {
    embeds: [
      {
        embedId: 'vixsrc-embed',
        url: iframeUrl.startsWith('//') ? `https:${iframeUrl}` : iframeUrl,
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
