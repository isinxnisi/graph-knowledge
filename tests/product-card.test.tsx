// @vitest-environment jsdom
import {it,expect,vi,afterEach} from "vitest";
import {render,screen,cleanup,fireEvent} from "@testing-library/react";
vi.mock('next/image',()=>({default:({unoptimized,...props}:React.ImgHTMLAttributes<HTMLImageElement>&{unoptimized?:boolean})=>{ void unoptimized;
 // Native image events are used to exercise the component's failure state.
 // eslint-disable-next-line @next/next/no-img-element
 return <img {...props} alt={props.alt??''}/>; }}));
vi.mock('../lib/client/ui-locale',()=>({useUiLocale:()=>({locale:'ja'})}));
import {RelatedProducts,type ProductCardItem} from '../components/ThemeProducts';
afterEach(cleanup);
const item:ProductCardItem={product:{id:'calendar:one',workId:'calendar:one',title:'Original long English title',displayName:{ja:'ジェームズ・ウェッブ宇宙望遠鏡 カレンダー',en:'Webb calendar'},author:'',edition:'',language:'en',category:'calendar',year:2027,metadataSource:'https://www.amazon.co.jp/dp/B0GMV4CK32',image:{url:'/api/knowledge/product-images/'+'a'.repeat(64),width:1254,height:1254,role:'illustration',alt:{ja:'紹介イラスト',en:'Illustration'}}},reason:{ja:'宇宙の景色を日々の暮らしへ。',en:'Space in everyday life.'},target:{kind:'theme',id:'t',revision:1},status:'ready',offer:{productId:'calendar:one',marketplace:'JP',asin:'B0GMV4CK32',status:'ready',affiliateUrl:'https://link.amazon/B0cLIilgt',checkedAt:'2026-11-10T00:00:00Z',image:undefined},alternatives:[]};
it('完成画面に画像・紹介・購入ボタン・短い広告表記・参加者表示を一緒に出す',()=>{
 render(<RelatedProducts items={[item]} market="JP" onMarket={()=>{}} en={false}/>);
 expect(screen.getByText('関連アイテム')).toBeTruthy();expect(screen.getByText('Amazonアフィリエイト')).toBeTruthy();expect(screen.getByText('紹介用イメージ')).toBeTruthy();expect(screen.getByRole('img',{name:'紹介イラスト'}).getAttribute('src')).toContain('size=small');
 const link=screen.getByRole('link',{name:'Amazonで購入する'});expect(link.getAttribute('href')).toBe('https://link.amazon/B0cLIilgt');expect(link.getAttribute('rel')).toContain('sponsored');expect(screen.getByText(/適格販売により収入/)).toBeTruthy();expect(screen.queryByText('地域未対応の試作を比較')).toBeNull();
});
it('未対応地域を架空の購入ボタンにせず、確認済み別地域を明示して選べる',()=>{
 render(<RelatedProducts items={[{...item,offer:null,alternatives:[item.offer!],status:'unverified'}]} market="US" onMarket={()=>{}} en={false}/>);
 expect(screen.queryByRole('link',{name:'Amazonで購入する'})).toBeNull();expect(screen.getByText('他の地域の購入先を見る')).toBeTruthy();expect(screen.getByRole('link',{name:'Amazon 日本'}).getAttribute('href')).toBe('https://link.amazon/B0cLIilgt');
});

it('画像取得が失敗しても紹介と確認済み購入先を残す',()=>{
 render(<RelatedProducts items={[item]} market="JP" onMarket={()=>{}} en={false}/>);
 fireEvent.error(screen.getByRole('img',{name:'紹介イラスト'}));
 expect(screen.getByText('画像を表示できません')).toBeTruthy();
 expect(screen.getByText('宇宙の景色を日々の暮らしへ。')).toBeTruthy();
 expect(screen.getByRole('link',{name:'Amazonで購入する'}).getAttribute('href')).toBe('https://link.amazon/B0cLIilgt');
});
