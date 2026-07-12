export default function ({ container, config }) {
  const iframe = container.querySelector('.spotify-embed');

  const type = config.type === 'album' ? 'album' : 'playlist';
  const id = config.playlistId || '37i9dQZF1DXcBWIGoYBM5M';

  iframe.src = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;

  return { pause() {}, resume() {} };
}
