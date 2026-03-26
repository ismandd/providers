import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '../../utils/errors';

type VidzeeServerList = {
  availableServers: Array<{
    server: number;
    name: string;
    sr: string;
  }>;
};

type VidzeeServerResponse = {
  url: Array<{
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

async function tryVidzeeServer(ctx: any, tmdbId: number | string, sr: number | string, ss: number, ep: number): Promise<string | null> {
  const apiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}&ss=${ss}&ep=${ep}`;
  
  try {
    const json = await ctx.proxiedFetcher<VidzeeServerResponse>(apiUrl);
    if (json?.url?.length > 0) {
      const primary = json.url[0];
      return decodeVidzeeLink(primary.link);
    }
  } catch {}
  return null;
}

async function vidzeeMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Vidzee');

  // Step 1: Get available servers
  try {
    const servers = await ctx.proxiedFetcher<VidzeeServerList>(`https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=`);
    
    if (!servers?.availableServers?.length) {
      throw new NotFoundError('No Vidzee servers available');
    }

    // Step 2: Try servers in order (Duke=0 first)
    for (const server of servers.availableServers.slice(0, 5)) { // Top 5 servers
      const streamUrl = await tryVidzeeServer(ctx, tmdbId, server.server, 0, 1);
      if (streamUrl) {
        return {
          embeds: [],
          stream: [{
            id: `vidzee-${server.server}`,
            type: 'hls',
            playlist: streamUrl,
            flags: [flags.CORS_ALLOWED],
            captions: [],
          }],
        };
      }
    }
  } catch (error: any) {
    console.error('[Vidzee] Server list failed:', error.message);
  }

  throw new NotFoundError('No Vidzee streams found');
}

async function vidzeeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Vidzee');

  const season = ctx.media.season.number;
  const episode = ctx.media.episode.number;

  // Step 1: Get available servers
  try {
    const servers = await ctx.proxiedFetcher<VidzeeServerList>(`https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=`);
    
    if (!servers?.availableServers?.length) {
      throw new NotFoundError('No Vidzee servers available');
    }

    // Step 2: Try servers in order
    for (const server of servers.availableServers.slice(0, 5)) {
      const streamUrl = await tryVidzeeServer(ctx, tmdbId, server.server, season, episode);
      if (streamUrl) {
        return {
          embeds: [],
          stream: [{
            id: `vidzee-${server.server}`,
            type: 'hls',
            playlist: streamUrl,
            flags: [flags.CORS_ALLOWED],
            captions: [],
          }],
        };
      }
    }
  } catch (error: any) {
    console.error('[Vidzee] Server list failed:', error.message);
  }

  throw new NotFoundError('No Vidzee streams found');
}

export const vidzeeScraper = makeSourcerer({
  id: 'vidzee',
  name: 'Vidzee',
  rank: 120,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidzeeMovie,
  scrapeShow: vidzeeShow,
});
