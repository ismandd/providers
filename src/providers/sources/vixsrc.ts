import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '../../utils/errors';

const BASE_URL = 'https://vixsrc.to';

async function vixsrcScrape(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Vixsrc');

  const mediaType = ctx.media.type === 'show' ? 'tv' : 'movie';
  let vixsrcUrl: string;

  if (mediaType === 'movie') {
    vixsrcUrl = `${BASE_URL}/movie/${tmdbId}`;
  } else {
    const season = (ctx as ShowScrapeContext).media.season.number;
    const episode = (ctx as ShowScrapeContext).media.episode.number;
    vixsrcUrl = `${BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
  }

  const html = await ctx.proxiedFetcher(vixsrcUrl);

  let masterPlaylistUrl: string | null = null;

  // Method 1: window.masterPlaylist (primary)
  if (html.includes('window.masterPlaylist')) {
    const urlMatch = html.match(/url:\s*['"]([^'"]+)['"]/);
    const tokenMatch = html.match(/token\s*:\s*['"]([^'"]+)['"]/);
    const expiresMatch = html.match(/expires\s*:\s*['"]([^'"]+)['"]/);

    if (urlMatch && tokenMatch && expiresMatch) {
      const baseUrl = urlMatch[1];
      const token = tokenMatch[1];
      const expires = expiresMatch[1];

      masterPlaylistUrl = baseUrl.includes('?b=1') 
        ? `${baseUrl}&token=${token}&expires=${expires}&h=1&lang=en`
        : `${baseUrl}?token=${token}&expires=${expires}&h=1&lang=en`;
    }
  }

  // Method 2: Direct .m3u8 links
  if (!masterPlaylistUrl) {
    const m3u8Match = html.match(/(https?:\/\/[^'\s]+\.m3u8[^'\s]*)/);
    if (m3u8Match) masterPlaylistUrl = m3u8Match[1];
  }

  if (!masterPlaylistUrl) {
    throw new NotFoundError('No Vixsrc stream found');
  }

  // PROXY HLS URL - CRITICAL for player
  const proxiedPlaylist = `https://simple-proxy.is-mand.workers.dev/?destination=${encodeURIComponent(masterPlaylistUrl)}`;

  return {
    embeds: [],
    stream: [{
      id: 'vixsrc-primary',
      type: 'hls',
      playlist: proxiedPlaylist,
      flags: [flags.CORS_ALLOWED],
      captions: [],
    }],
  };
}

export const vixsrcScraper = makeSourcerer({
  id: 'vixsrc',
  name: 'Vixsrc',
  rank: 998,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vixsrcScrape,
  scrapeShow: vixsrcScrape,
});
