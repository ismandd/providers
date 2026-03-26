import { makeSourcerer } from '../base';
import { flags } from '../flags';
import { NotFoundError } from '../../utils/errors';

type VidzeeServerResponse = {
  url: Array<{
    lang: string;
    link: string;    // base64 encoded
    type: string;    // "hls"
    name: string;
    flag: string;
  }>;
  tracks: Array<{
    lang: string;
    url: string;
  }>;
};

function decodeVidzeeLink(encoded: string): string {
  // Vidzee returns base64; link example from your capture:
  // "Zis1NHk5eDQwdW1pTmxscVNaRE1ZZz09Okt6dnM1YnpTMW9nMENDMVZxemZrUDhXcVBIN1JpYjFqOFR3cVkrOVNlendRbFlaTGt4c09sWTlWT05uSzFsd1lOZ1JpZDkxc1NDSW0xaE9GMHB4Qm5jN2hERER1NXlCcVhDUk1oT2RybVVvPQ=="
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  // Vidzee usually uses "encrypted:decrypted" or similar; take the part after colon if present.
  const parts = decoded.split(':');
  return parts.length > 1 ? parts[1] : decoded;
}

export const vidzeeScraper = makeSourcerer({
  id: 'vidzee',
  name: 'Vidzee',
  rank: 120,
  flags: [flags.CORS_ALLOWED],

  async scrapeMovie(ctx) {
    const tmdbId = ctx.media.tmdbId || ctx.media.id;
    if (!tmdbId) throw new NotFoundError('No TMDB/ID for Vidzee');

    const apiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=0&ss=0&ep=1`;

    const json = await ctx.fetcher<VidzeeServerResponse>(apiUrl, {
      method: 'GET',
      headers: {
        // matches what you saw in the network log
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      },
    });

    if (!json.url || json.url.length === 0) {
      throw new NotFoundError('No Vidzee URL found');
    }

    const primary = json.url[0];
    const decrypted = decodeVidzeeLink(primary.link);

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: decrypted,
          flags: [flags.CORS_ALLOWED],
          captions:
            json.tracks?.map((t) => ({
              id: t.lang,
              lang: t.lang,
              url: t.url,
            })) ?? [],
        },
      ],
      // Optionally expose the raw Xalaflix URL to downstream providers
      meta: {
        xalaflixUrl: decrypted,
      },
    };
  },

  async scrapeShow(ctx) {
    const tmdbId = ctx.media.tmdbId || ctx.media.id;
    if (!tmdbId) throw new NotFoundError('No TMDB/ID for Vidzee');

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
      throw new NotFoundError('No Vidzee URL found');
    }

    const primary = json.url[0];
    const decrypted = decodeVidzeeLink(primary.link);

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: decrypted,
          flags: [flags.CORS_ALLOWED],
          captions:
            json.tracks?.map((t) => ({
              id: t.lang,
              lang: t.lang,
              url: t.url,
            })) ?? [],
        },
      ],
      meta: {
        xalaflixUrl: decrypted,
      },
    };
  },
});
