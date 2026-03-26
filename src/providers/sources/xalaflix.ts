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
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const parts = decoded.split(':');
  return parts.length > 1 ? parts[1] : decoded;
}

async function xalaflixMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Xalaflix movie');

  const apiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=0&ss=0&ep=1`;

  const json = await ctx.fetcher<VidzeeServerResponse>(apiUrl, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    },
  });

  if (!json.url || json.url.length === 0) {
    throw new NotFoundError('No Xalaflix URL found via Vidzee');
  }

  const primary = json.url[0];
  const decrypted = decodeVidzeeLink(primary.link);

  const captions =
    json.tracks?.map((t, idx) => ({
      id: `xalaflix-${idx}`,
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

async function xalaflixShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  const tmdbId = ctx.media.tmdbId;
  if (!tmdbId) throw new NotFoundError('No TMDB ID for Xalaflix show');

  const season = ctx.media.season.number;
  const episode = ctx.media.episode.number;

  const apiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=0&ss=${season}&ep=${episode}`;

  const json = await ctx.fetcher<VidzeeServerResponse>(apiUrl, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    },
  });

  if (!json.url || json.url.length === 0) {
    throw new NotFoundError('No Xalaflix URL found via Vidzee');
  }

  const primary = json.url[0];
  const decrypted = decodeVidzeeLink(primary.link);

  const captions =
    json.tracks?.map((t, idx) => ({
      id: `xalaflix-${idx}`,
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

export const xalaflixScraper = makeSourcerer({
  id: 'xalaflix',
  name: 'Xalaflix',
  rank: 121,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: xalaflixMovie,
  scrapeShow: xalaflixShow,
});
