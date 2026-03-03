const RAW_PLAYLIST_ID = /^[A-Za-z0-9_-]{12,}$/;

export const parsePlaylistId = (value: string): string | null => {
  const input = value.trim();
  if (!input) {
    return null;
  }

  if (RAW_PLAYLIST_ID.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const list = url.searchParams.get('list');
    if (list && RAW_PLAYLIST_ID.test(list)) {
      return list;
    }

    if (url.pathname === '/playlist') {
      const fromPlaylistPath = url.searchParams.get('list');
      if (fromPlaylistPath && RAW_PLAYLIST_ID.test(fromPlaylistPath)) {
        return fromPlaylistPath;
      }
    }
  } catch {
    return null;
  }

  return null;
};
