import DOMPurify from '../vendor/purify.es.mjs';

// Keep escaping dynamic values at their source, then sanitize the complete
// fragment before attaching it. No string-to-HTML mutation follows this step.
// Only our bundled SVG sprite references are needed by <use>.
DOMPurify.addHook('uponSanitizeAttribute', (node, attribute) => {
  if (node.localName === 'use' && attribute.attrName.endsWith('href')
      && (attribute.attrName !== 'href' || !/^#i-[a-z0-9-]+$/.test(attribute.attrValue))) attribute.keepAttr = false;
  if (attribute.attrName === 'target' && (node.localName !== 'a' || attribute.attrValue !== '_blank')) attribute.keepAttr = false;
});

export function safeFragment(markup) {
  if (!DOMPurify.isSupported) throw new Error('UNSUPPORTED_DOM');
  const fragment = DOMPurify.sanitize(markup, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true, svg: true },
    ADD_TAGS: ['use'],
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style'],
    FORBID_ATTR: ['style'],
  });
  // This adds only a fixed defensive attribute, never unsanitized markup.
  for (const link of fragment.querySelectorAll('a[target="_blank"]')) link.setAttribute('rel', 'noopener noreferrer');
  return fragment;
}
