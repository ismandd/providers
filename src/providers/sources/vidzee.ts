import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '../../utils/errors';

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
  // Browser-safe base64 decode (no Buffer)
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
    return encoded; // fallback
  }
}

async function vidzeeMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Vidzee');

  const apiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=0&ss=0&ep=1`;
  const json = await ctx.proxiedFetcher<VidzeeServerResponse>(apiUrl);

  if (!json.url || json.url.length === 0) {
    throw new NotFoundError('No Vidzee URL found');
  }

  const primary = json.url[0];
  const decrypted = decodeVidzeeLink(primary.link);

  const captions = json.tracks?.map((t, idx) => ({
    id: `vidzee-${idx}`,
    lang: t.lang,
    url: t.url,
    type: 'vtt' as const,
    hasClosedCaptions: false,
  })) ?? [];

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        type: 'hls',
        playlist: decrypted,
        flags: [flags.CORS_ALLOWED],
        captions,
      },
    ],
  };
}

async function vidzeeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Vidzee');

  const season = ctx.media.season.number;
  const episode = ctx.media.episode.number;

  const apiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=0&ss=${season}&ep=${episode}`;
  const json = await ctx.proxiedFetcher<VidzeeServerResponse>(apiUrl);

  if (!json.url || json.url.length === 0) {
    throw new NotFoundError('No Vidzee URL found');
  }

  const primary = json.url[0];
  const decrypted = decodeVidzeeLink(primary.link);

  const captions = json.tracks?.map((t, idx) => ({
    id: `vidzee-${idx}`,
    lang: t.lang,
    url: t.url,
    type: 'vtt' as const,
    hasClosedCaptions: false,
  })) ?? [];

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        type: 'hls',
        playlist: decrypted,
        flags: [flags.CORS_ALLOWED],
        captions,
      },
    ],
  };
}

export const vidzeeScraper = makeSourcerer({
  id: 'vidzee',
  name: 'Vidzee',
  rank: 120,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidzeeMovie,
  scrapeShow: vidzeeShow,
});
