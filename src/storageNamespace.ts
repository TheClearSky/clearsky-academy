/**
 * The prefix of every key this app stores in the browser (localStorage,
 * sessionStorage, IndexedDB). Never change it once the site is public:
 * every existing browser would forget its saved progress and settings
 * (Nodestra kept its former name as its prefix for exactly this reason).
 */
const STORAGE_NAMESPACE = 'clearsky-academy';

export { STORAGE_NAMESPACE };
