import { load } from 'cheerio';
import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '../../utils/errors';

const BASE_URL = 'https://vixsrc.to';

async function getSubtitles(ctx: MovieScrapeContext | ShowScrapeContext, subtitleApiUrl: string): Promise<string | null> {
  try {
    const subtitleData = await ctx.proxiedFetcher(subtitleApiUrl);
    
    let subtitleTrack = subtitleData.find((track: any) =>
      track.display.includes('English') && 
      (track.encoding === 'ASCII' || track.encoding === 'UTF-8')
    ) || 
    subtitleData.find((track: any) => 
      track.display.includes('English') && track.encoding === 'CP1252'
    ) ||
    subtitleData.find((track: any) => 
      track.display.includes('English') && track.encoding === 'CP1250'
    ) ||
    subtitleData.find((track: any) => 
      track.display.includes('English') && track.encoding === 'CP850'
    );

    return subtitleTrack ? subtitleTrack.url : null;
  } catch {
    return null;
  }
}

async function vixsrcScrape(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const mediaType = ctx.media.type === 'show' ? 'tv' : 'movie';
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Vixsrc');

  let vixsrcUrl: string;
  let subtitleApiUrl: string;

  if (mediaType === 'movie') {
    vixsrcUrl = `${BASE_URL}/movie/${tmdbId}`;
    subtitleApiUrl = `https://sub.wyzie.ru/search?id=${tmdbId}`;
  } else {
    const season = (ctx as ShowScrapeContext).media.season.number;
    const episode = (ctx as ShowScrapeContext).media.episode.number;
    vixsrcUrl = `${BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
    subtitleApiUrl = `https://sub.wyzie.ru/search?id=${tmdbId}&season=${season}&episode=${episode}`;
  }

  // ctx.proxiedFetcher automatically uses VITE_CORS_PROXY_URL
  const html = await ctx.proxiedFetcher(vixsrcUrl);

  let masterPlaylistUrl: string | null = null;

  // Method 1: window.masterPlaylist
  if (html.includes('window.masterPlaylist')) {
    const urlMatch = html.match(/url:\s*['"]([^'"]+)['"]/);
    const tokenMatch = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
    const expiresMatch = html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);

    if (urlMatch && tokenMatch && expiresMatch) {
      const baseUrl = urlMatch[1];
      const token = tokenMatch[1];
      const expires = expiresMatch[1];

      masterPlaylistUrl = baseUrl.includes('?b=1') 
        ? `${baseUrl}&token=${token}&expires=${expires}&h=1&lang=en`
        : `${baseUrl}?token=${token}&expires=${expires}&h=1&lang=en`;
    }
  }

  // Method 2: direct .m3u8
  if (!masterPlaylistUrl) {
    const m3u8Match = html.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
    if (m3u8Match) masterPlaylistUrl = m3u8Match[1];
  }

  // Method 3: script tags
  if (!masterPlaylistUrl) {
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        const streamMatch = script.match(/['"]?(https?:\/\/[^'"\s]+(?:\.m3u8|playlist)[^'"\s]*)/);
        if (streamMatch) {
          masterPlaylistUrl = streamMatch[1];
          break;
        }
      }
    }
  }

  if (!masterPlaylistUrl) {
    throw new NotFoundError('No Vixsrc stream found');
  }

  const subtitlesUrl = await getSubtitles(ctx, subtitleApiUrl);

  const captions = subtitlesUrl ? [{
    id: 'en',
    lang: 'English',
    url: subtitlesUrl,
    type: 'vtt' as const,
    hasClosedCaptions: false,
  }] : [];

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        type: 'hls',
        playlist: masterPlaylistUrl,
        flags: [flags.CORS_ALLOWED],
        captions,
      },
    ],
  };
}

export const vixsrcScraper = makeSourcerer({
  id: 'vixsrc',
  name: 'Vixsrc',
  rank: 860,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vixsrcScrape,
  scrapeShow: vixsrcScrape,
});
