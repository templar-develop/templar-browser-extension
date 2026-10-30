// First-party routing policy. This is a domain bypass, never a geo-IP lookup
// or a claim to know the destination of arbitrary Russian CDNs.
export const RF_SUFFIXES = Object.freeze(['ru', 'su', 'xn--p1ai']);
export const RF_DOMAINS = Object.freeze([
  'vk.com', 'vkuser.net', 'vkuseraudio.net', 'vkuservideo.net',
  'vkuserlive.net', 'mycdn.me', 'userapi.com', 'yandex.com',
  'yandex.net', 'yastatic.net', 'whoosh.bike',
]);

export function russianService(host) {
  return RF_SUFFIXES.some(suffix => host === suffix || host.endsWith('.' + suffix))
    || RF_DOMAINS.some(domain => host === domain || host.endsWith('.' + domain));
}
