// Source defaults to offline. Build with an explicit --api to connect a package
// to the first-party service; never enable networking in an unconfigured build.
export const API_BASE = null;
export const ALLOW_LOCAL_FIXTURE = false;
export const BUILD_VERSION = '0.4.5';
// Set by the package builder once the public repository exists.
export const SOURCE_CODE_URL = null;
