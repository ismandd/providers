import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '../../utils/errors';

type VidzeeServerList = {
  availableServers?: Array<{
    server: number;
    name: string;
    sr: string;
  }>;
  error?: string;
};

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
  error?: string;
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

async function tryVidzeeServer(
  ctx: any,
  tmdbId: number | string,
  sr: number | string,
  ss: number,
  ep: number
): Promise<{ playlist: string; captions: Array<{ label: string; url: string; lang: string }> } | null> {
  const apiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}&ss=${ss}&ep=${ep}`;

  try {
    const json = await ctx.proxiedFetcher<VidzeeServerResponse>(apiUrl);

    const playlist = json?.url?.[0]?.link ? decodeVidzeeLink(json.url[0].link) : null;
    if (!playlist) return null;

    const captions =
      json?.tracks?.map((t) => ({
        label: t.lang,
        url: t.url,
        lang: t.lang,
      })) ?? [];

    return { playlist, captions };
  } catch {
    return null;
  }
}

async function getVidzeeServers(ctx: any, tmdbId: number | string): Promise<VidzeeServerList['availableServers']> {
  const url = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=`;
  const json = await ctx.proxiedFetcher<VidzeeServerList>(url);
  return json?.availableServers ?? [];
}

async function vidzeeMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Vidzee');

  try {
    const serverList = await getVidzeeServers(ctx, tmdbId);

    for (const server of serverList.slice(0, 5)) {
      const result = await tryVidzeeServer(ctx, tmdbId, server.server, 0, 1);
      if (!result) continue;

      const proxiedPlaylist = `https://simple-proxy.is-mand.workers.dev/?destination=${encodeURIComponent(result.playlist)}`;

      return {
        embeds: [],
        stream: [
          {
            id: `vidzee-${server.name.toLowerCase()}`,
            type: 'hls',
            playlist: proxiedPlaylist,
            flags: [flags.CORS_ALLOWED],
            captions: result.captions,
          },
        ],
      };
    }
  } catch (error: any) {
    console.error('[Vidzee] Server discovery failed:', error?.message ?? error);
  }

  throw new NotFoundError('No Vidzee streams found');
}

async function vidzeeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Vidzee');

  const season = ctx.media.season.number;
  const episode = ctx.media.episode.number;

  try {
    const serverList = await getVidzeeServers(ctx, tmdbId);

    for (const server of serverList.slice(0, 5)) {
      const result = await tryVidzeeServer(ctx, tmdbId, server.server, season, episode);
      if (!result) continue;

      const proxiedPlaylist = `https://simple-proxy.is-mand.workers.dev/?destination=${encodeURIComponent(result.playlist)}`;

      return {
        embeds: [],
        stream: [
          {
            id: `vidzee-${server.name.toLowerCase()}-s${season}e${episode}`,
            type: 'hls',
            playlist: proxiedPlaylist,
            flags: [flags.CORS_ALLOWED],
            captions: result.captions,
          },
        ],
      };
    }
  } catch (error: any) {
    console.error('[Vidzee] Server discovery failed:', error?.message ?? error);
  }

  throw new NotFoundError('No Vidzee streams found');
}

export const vidzeeScraper = makeSourcerer({
  id: 'vidzee',
  name: 'Vidzee',
  rank: 999,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidzeeMovie,
  scrapeShow: vidzeeShow,
});
