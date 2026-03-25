import { flags } from '@/search/flags';
import { makeSourcerer } from '@/providers/base';
import { MovieMedia, ShowMedia } from '@/search/entities';

export const vidzeeScraper = makeSourcerer({
  id: 'vidzee',
  name: 'Vidzee',
  rank: 150,
  flags: [flags.CORS_ALLOWED],
  async scrapeMovie(ctx) {
    // 1. Fetch the server data using the TMDB ID (ctx.media.tmdbId)
    const data = await ctx.fetcher(`https://player.vidzee.wtf/api/server?id=${ctx.media.tmdbId}&sr=0`);
    
    // 2. Map the results to the format P-Stream expects
    const streams = data.url.map((stream: any) => ({
      id: stream.name,
      type: 'hls',
      playlist: stream.link, // Note: This link is likely base64 encoded and needs decoding
      flags: [flags.CORS_ALLOWED],
      captions: data.tracks.map((track: any) => ({
        id: track.url,
        language: track.lang.toLowerCase(),
        type: 'vtt',
        url: track.url,
      })),
    }));

    return {
      embeds: [],
      streams: streams,
    };
  },
  async scrapeShow(ctx) {
    // Similar logic for shows using ctx.media.season.number and ctx.media.episode.number
    return { embeds: [], streams: [] };
  },
});
