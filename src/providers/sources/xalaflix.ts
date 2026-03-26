import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '../../utils/errors';

type VidzeeServerResponse = {
  url?: Array<{
    lang: string;
    link: string;
    type: string;
    name: string;
    flag: string;
  }>;
  tracks?: Array<{
    lang: string;
    url: string;
  }>;
};

function decodeVidzeeLink(encoded: string): string {
  try {
    const binaryString = atob(encoded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decoded = new TextDecoder().decode(bytes);
    const parts = decoded.split(':');
    return parts.length > 1 ? parts[1] : decoded;
  } catch {
    return encoded;
  }
}

async function xalaflixMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Xalaflix');

  const dukeUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=0&ss=0&ep=1`;
  const response = await ctx.proxiedFetcher<VidzeeServerResponse>(dukeUrl);
  
  if (response?.url?.length > 0) {
    const primary = response.url[0];
    const playlist = decodeVidzeeLink(primary.link);
    
    return {
      embeds: [],
      stream: [{
        id: 'xalaflix-duke',
        type: 'hls',
        playlist: `https://simple-proxy.is-mand.workers.dev/?destination=${encodeURIComponent(playlist)}`,
        flags: [flags.CORS_ALLOWED],
        captions: (response.tracks || []).map((t: any, i: number) => ({
          id: `xalaflix-${i}`,
          lang: t?.lang || 'en',
          url: t?.url || '',
          type: 'vtt' as const,
          hasClosedCaptions: false,
        })).filter((c: any) => c.url),
      }],
    };
  }

  throw new NotFoundError('No Xalaflix streams found');
}

async function xalaflixShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Xalaflix');

  const season = ctx.media.season.number;
  const episode = ctx.media.episode.number;

  const dukeUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=0&ss=${season}&ep=${episode}`;
  const response = await ctx.proxiedFetcher<VidzeeServerResponse>(dukeUrl);
  
  if (response?.url?.length > 0) {
    const primary = response.url[0];
    const playlist = decodeVidzeeLink(primary.link);
    
    return {
      embeds: [],
      stream: [{
        id: `xalaflix-duke-s${season}e${episode}`,
        type: 'hls',
        playlist: `https://simple-proxy.is-mand.workers.dev/?destination=${encodeURIComponent(playlist)}`,
        flags: [flags.CORS_ALLOWED],
        captions: (response.tracks || []).map((t: any, i: number) => ({
          id: `xalaflix-${i}`,
          lang: t?.lang || 'en',
          url: t?.url || '',
          type: 'vtt' as const,
          hasClosedCaptions: false,
        })).filter((c: any) => c.url),
      }],
    };
  }

  throw new NotFoundError('No Xalaflix streams found');
}

export const xalaflixScraper = makeSourcerer({
  id: 'xalaflix',
  name: 'Xalaflix',
  rank: 997,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: xalaflixMovie,
  scrapeShow: xalaflixShow,
});
