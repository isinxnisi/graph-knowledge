import { AD_TAGS, GA_MEASUREMENT_ID, PUBLIC_EVENTS, PUBLIC_ORIGIN } from "../domain/publication";

const head = '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plunode</title><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>';
export function adFrame(device: keyof typeof AD_TAGS) {
  const height = device === "mobile" ? 50 : 90;
  return head + `<script>
  // Served exclusively on the advertisement origin, which has no account or app routes.
  let shown=null;
  function content(el,depth=0){const r=el.getBoundingClientRect();if(r.width<=10||r.height<=10)return false;
    if(el.tagName==='IMG')return el.complete&&el.naturalWidth>10;
    if(el.tagName==='IFRAME'&&depth<3){try{const d=el.contentDocument;if(d)return !!d.body?.innerText.trim()||[...d.querySelectorAll('iframe,img,object,embed,canvas,svg,a')].some(child=>content(child,depth+1))}catch{}return !!el.src&&el.src!=='about:blank'}
    return true;
  }
  function report(){const banner=document.querySelector('[id^="admax-banner-"]');if(!banner)return;
    const visible=[...banner.querySelectorAll('iframe,img,object,embed,canvas,svg,a')].some(el=>content(el));
    if(visible!==shown){shown=visible;parent.postMessage({type:'plunode-ad-status',filled:visible,height:${height}},'*')}
  }
  new MutationObserver(report).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
  document.addEventListener('load',report,true);setInterval(report,1000);
  </script><script src="https://adm.shinobi.jp/s/${AD_TAGS[device]}"></script></body></html>`;
}
export function analyticsFrame() {
  return head + `<script>
  window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
  gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  gtag('js',new Date());
  const safe={page_location:'${PUBLIC_ORIGIN}/',page_referrer:'',page_title:'Plunode',allow_google_signals:false,allow_ad_personalization_signals:false};
  gtag('config','${GA_MEASUREMENT_ID}',{...safe,send_page_view:false,cookie_domain:'none',cookie_flags:'SameSite=Lax;Secure',cookie_expires:15552000});
  const names=${JSON.stringify(PUBLIC_EVENTS)};let viewed=false;
  addEventListener('message',event=>{
    if(event.source!==parent||event.origin!=='${PUBLIC_ORIGIN}')return;
    const data=event.data;if(!data||data.type!=='plunode-metric')return;
    if(data.event==='page_view'){
      if(viewed)return;viewed=true;
      const path=typeof data.path==='string'&&/^\\/explore\\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(data.path)?data.path:'/';
      safe.page_location='${PUBLIC_ORIGIN}'+path;
      gtag('set',safe);gtag('event','page_view',safe);
    }else if(viewed&&names.includes(data.event))gtag('event',data.event,safe);
  });
  parent.postMessage({type:'plunode-analytics-ready'},'${PUBLIC_ORIGIN}');
  </script><script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script></body></html>`;
}
export function frameResponse(html: string, advertising: boolean) {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": advertising
      ? "sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox; default-src https: data: blob:; script-src https: 'unsafe-inline' 'unsafe-eval'; style-src https: 'unsafe-inline'; frame-ancestors https://plunode.net https://graph-beta.isinxnisi.com http://127.0.0.1:* http://localhost:*; base-uri 'none'; form-action 'none'"
      : "default-src 'none'; script-src 'unsafe-inline' https://www.googletagmanager.com; connect-src https://*.google-analytics.com https://*.analytics.google.com; img-src https://*.google-analytics.com https://*.analytics.google.com; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" } });
}
