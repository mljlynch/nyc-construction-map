import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://nychousingmap.com/' }, { url: 'https://nychousingmap.com/about' }];
}
