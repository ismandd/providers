import { makeSourcerer } from '../base';
import { flags } from '../flags';
import { MovieMedia, ShowMedia } from '../entities';
import { NotFoundError } from '../../utils/errors';

export const vidzeeScraper = makeSourcerer({
  id: 'vidzee',
  name: 'Vidzee',
  rank: 120,
  flags: [flags.CORS_ALLOWED],
  async scrapeMovie(ctx) {
    const searchResponse = await ctx.fetcher<string>(`https://vidzee.to/search?query=${encodeURIComponent(ctx.media.title)}`, {
      method: 'GET',
    });

    const match = searchResponse.match(/href="\/watch\/(movie\/[^"]+)"/);
    if (!match) throw new NotFoundError('No movie found');

    const videoPage = await ctx.fetcher<string>(`https://vidzee.to/watch/${match[1]}`, {
      method: 'GET',
    });

    const sourceMatch = videoPage.match(/source:\s*["'](https:\/\/[^"']+)["']/);
    if (!sourceMatch) throw new NotFoundError('No video source found');

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: sourceMatch[1],
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },
  async scrapeShow(ctx) {
    const searchResponse = await ctx.fetcher<string>(`https://vidzee.to/search?query=${encodeURIComponent(ctx.media.title)}`, {
      method: 'GET',
    });

    const match = searchResponse.match(new RegExp(`href="\\/watch\\/(tv\\/[^"]+)"`));
    if (!match) throw new NotFoundError('No show found');

    const episodePage = await ctx.fetcher<string>(`https://vidzee.to/watch/${match[1]}/season/${ctx.media.season.number}/episode/${ctx.media.episode.number}`, {
      method: 'GET',
    });

    const sourceMatch = episodePage.match(/source:\s*["'](https:\/\/[^"']+)["']/);
    if (!sourceMatch) throw new NotFoundError('No video source found');

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: sourceMatch[1],
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },
});
