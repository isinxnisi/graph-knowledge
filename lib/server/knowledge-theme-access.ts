import {AsyncLocalStorage} from 'node:async_hooks';
/** Server-only capability, never supplied in an HTTP query or MCP input. */
const scope=new AsyncLocalStorage<boolean>();
export const operatorThemeRead=()=>scope.getStore()===true;
export const withOperatorThemeRead=<T>(work:()=>T):T=>scope.run(true,work);
export const withPublicThemeRead=<T>(work:()=>T):T=>scope.run(false,work);
