import { makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { SourcererOutput } from '@/providers/base';
import { flags } from '@/entrypoint/utils/targets';

const TMDB_API_KEY = '68e094699525b18a70bab2f86b1fa706';
const BASE_URL = 'https://vixsrc.to';

async function getTmdbInfo(tmdbId: number | string, mediaType: 'movie' | 'tv') {
  const url = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  const data = await res.json();
  const title = mediaType === 'tv' ? data.name : data.title;
  const year =
    mediaType === 'tv'
      ? data.first_air_date?.substring(0, 4)
      : data.release_date?.substring(0, 4);
  if (!title) throw new Error('Could not extract title from TMDB response');
  return { title, year, data };
}

async function extractStreamFromPage(
  contentType: 'movie' | 'tv',
  contentId: number | string,
  seasonNum?: number,
  episodeNum?: number,
) {
  let vixsrcUrl: string;
  let subtitleApiUrl: string;

  if (contentType === 'movie') {
    vixsrcUrl = `${BASE_URL}/movie/${contentId}`;
    subtitleApiUrl = `https://sub.wyzie.ru/search?id=${contentId}`;
  } else {
    vixsrcUrl = `${BASE_URL}/tv/${contentId}/${seasonNum}/${episodeNum}`;
    subtitleApiUrl = `https://sub.wyzie.ru/search?id=${contentId}&season=${seasonNum}&episode=${episodeNum}`;
  }

  const res = await fetch(vixsrcUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`Vixsrc HTTP ${res.status}`);
  const html = await res.text();

  let masterPlaylistUrl: string | null = null;

  // Method 1: window.masterPlaylist (simplified)
  if (html.includes('window.masterPlaylist')) {
    const urlMatch = html.match(/url:\s*['"]([^'"]+)['"]/);
    const tokenMatch = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
    const expiresMatch = html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);

    if (urlMatch && tokenMatch && expiresMatch) {
      const baseUrl = urlMatch[1];
      const token = tokenMatch[1];
      const expires = expiresMatch[1];

      if (baseUrl.includes('?b=1')) {
        masterPlaylistUrl = `${baseUrl}&token=${token}&expires=${expires}&h=1&lang=en`;
      } else {
        masterPlaylistUrl = `${baseUrl}?token=${token}&expires=${expires}&h=1&lang=en`;
      }
    }
  }

  // Method 2: direct .m3u8
  if (!masterPlaylistUrl) {
    const m3u8Match = html.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
    if (m3u8Match) {
      masterPlaylistUrl = m3u8Match[1];
    }
  }

  // Method 3: script tags
  if (!masterPlaylistUrl) {
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        const streamMatch = script.match(
          /['"]?(https?:\/\/[^'"\s]+(?:\.m3u8|playlist)[^'"\s]*)/,
        );
        if (streamMatch) {
          masterPlaylistUrl = streamMatch[1];
          break;
        }
      }
    }
  }

  if (!masterPlaylistUrl) return null;

  return { masterPlaylistUrl, subtitleApiUrl };
}

async function getSubtitles(subtitleApiUrl: string): Promise<string | null> {
  try {
    const res = await fetch(subtitleApiUrl);
    if (!res.ok) return null;
    const subtitleData = await res.json();

    let subtitleTrack =
      subtitleData.find(
        (track: any) =>
          track.display.includes('English') &&
          (track.encoding === 'ASCII' || track.encoding === 'UTF-8'),
      ) ||
      subtitleData.find(
        (track: any) =>
          track.display.includes('English') && track.encoding === 'CP1252',
      ) ||
      subtitleData.find(
        (track: any) =>
          track.display.includes('English') && track.encoding === 'CP1250',
      ) ||
      subtitleData.find(
        (track: any) =>
          track.display.includes('English') && track.encoding === 'CP850',
      );

    return subtitleTrack ? subtitleTrack.url : null;
  } catch {
    return null;
  }
}

async function vixsrcScrape(
  ctx: MovieScrapeContext | ShowScrapeContext,
): Promise<SourcererOutput> {
  const mediaType =
    ctx.media.type === 'show' ? ('tv' as const) : ('movie' as const);
  const tmdbId = ctx.media.tmdbId ?? ctx.media.id;
  if (!tmdbId) throw new Error('No TMDB ID for Vixsrc');

  await getTmdbInfo(tmdbId, mediaType); // currently only used for logging/title/year

  const season =
    ctx.media.type === 'show' ? ctx.media.season.number : undefined;
  const episode =
    ctx.media.type === 'show' ? ctx.media.episode.number : undefined;

  const streamData = await extractStreamFromPage(
    mediaType,
    tmdbId,
    season,
    episode,
  );

  if (!streamData) {
    throw new Error('No stream data found from Vixsrc');
  }

  const subtitlesUrl = await getSubtitles(streamData.subtitleApiUrl);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        type: 'hls',
        playlist: streamData.masterPlaylistUrl,
        flags: [flags.CORS_ALLOWED],
        captions: subtitlesUrl
          ? [
              {
                id: 'en',
                lang: 'English',
                url: subtitlesUrl,
              },
            ]
          : [],
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
