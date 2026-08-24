/**
 * The one place that knows the download bundle layout:
 *   <Species>/images/<Name>.<ext>  - the original photo bytes
 *   <Species>/qr/<Name>.png        - the QR PNG
 *   <Species>/plates/<Name>.jpg    - the composed plate
 * Same base name in all three folders so any file identifies its tree at a
 * glance. Browser ZIPs and the production disk output both use this.
 */
import { splitName } from './naming.mjs';

export function bundlePaths(entry, hasTemplate) {
  const ext = splitName(entry.file).ext.toLowerCase() || '.jpg';
  return {
    image: `${entry.species}/images/${entry.name}${ext}`,
    qr: `${entry.species}/qr/${entry.name}.png`,
    plate: hasTemplate ? `${entry.species}/plates/${entry.name}.jpg` : null,
  };
}
