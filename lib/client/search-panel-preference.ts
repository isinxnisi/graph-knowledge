export const searchPanelPreferenceKey = "plunode.search-panel-collapsed.v1";

// Runs in <head>, before the first paint. CSS and the hydrated controls share
// this attribute so a saved closed panel never paints open first.
export const searchPanelPreferenceBootstrap = `(function(){var closed=false;try{closed=localStorage.getItem(${JSON.stringify(searchPanelPreferenceKey)})==="true";}catch(e){}document.documentElement.dataset.searchPanelCollapsed=String(closed);})();`;
