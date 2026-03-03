export const createFakeYouTubeClient = (itemCount = 6) => {
    const ids = Array.from({ length: itemCount }).map((_, index) => `video-${index + 1}`);
    return {
        async getPlaylistMetadata(playlistId) {
            return {
                playlistId,
                playlistTitle: 'Demo Playlist',
                itemCount
            };
        },
        async *iteratePlaylistVideoIds(_playlistId, maxItems) {
            const target = ids.slice(0, maxItems);
            for (let i = 0; i < target.length; i += 2) {
                yield target.slice(i, i + 2);
            }
        },
        async getVideosByIds(videoIds) {
            return videoIds.map((id, index) => ({
                id,
                snippet: {
                    title: `Video ${id}`,
                    channelTitle: 'Demo Channel',
                    publishedAt: '2024-01-01T00:00:00Z',
                    thumbnails: {
                        default: {
                            url: `https://img.example/${id}.jpg`
                        }
                    }
                },
                contentDetails: {
                    duration: `PT${index + 1}M`
                },
                statistics: {
                    viewCount: '100',
                    likeCount: '10'
                }
            }));
        }
    };
};
