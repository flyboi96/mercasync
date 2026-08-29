import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return { name: 'MercaSync', short_name: 'MercaSync', description: 'Alex and Nathalia’s shared household food and schedule planner.', start_url: '/', display: 'standalone', background_color: '#f7f5ef', theme_color: '#315f4b', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] };
}
