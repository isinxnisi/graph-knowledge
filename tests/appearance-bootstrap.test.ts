// @vitest-environment jsdom
import {afterEach,expect,it} from "vitest";
import {appearanceBootstrap,appearanceKey} from "../lib/client/appearance";
afterEach(()=>{localStorage.clear();delete document.documentElement.dataset.theme;});
it('applies the saved palette before the app mounts',()=>{localStorage.setItem(appearanceKey,JSON.stringify({theme:'dark-blue',palette:'blue'}));window.eval(appearanceBootstrap);expect(document.documentElement.dataset.theme).toBe('dark-blue');});
it('leaves invalid storage at the default theme',()=>{localStorage.setItem(appearanceKey,'{"theme":"injected","palette":"brown"}');window.eval(appearanceBootstrap);expect(document.documentElement.dataset.theme).toBeUndefined();localStorage.setItem(appearanceKey,'not-json');expect(()=>window.eval(appearanceBootstrap)).not.toThrow();});
