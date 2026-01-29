/**
 * Layout registry and selection.
 * @module layouts
 */

import frontpage from "./layout-frontpage.js";
import tidy from "./layout-tidy.js";
import icicle from "./layout-icicle.js";
import lanes from "./layout-lanes.js";
import sankey from "./layout-sankey.js";

export const layoutList = [frontpage, sankey, tidy, icicle, lanes];

export function getLayout(id) {
  return layoutList.find((layout) => layout.id === id) || sankey;
}
