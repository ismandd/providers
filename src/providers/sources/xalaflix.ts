import { makeSourcerer } from '../base';
import { flags } from '../flags';
import { NotFoundError } from '../../utils/errors';

export const xalaflixScraper = makeSourcerer({
  id: 'xalaflix',
  name: 'Xalaflix (Vidzee)',
  rank: 121,
  flags: [flags.CORS_ALLOWED],

  async scrapeMovie(ctx) {
    if (!ctx.media.meta?.xalaflixUrl) {
      throw new NotFoundError('No Xalaflix URL on media meta');
    }

    const playlistUrl = ctx.media.meta.xalaflixUrl as string;

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: playlistUrl,
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },

  async scrapeShow(ctx) {
    if (!ctx.media.meta?.xalaflixUrl) {
      throw new NotFoundError('No Xalaflix URL on media meta');
    }

    const playlistUrl = ctx.media.meta.xalaflixUrl as string;

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: playlistUrl,
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },
});
