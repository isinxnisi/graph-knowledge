import {it,expect,vi} from "vitest";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
vi.mock("server-only",()=>({}));
import {creatorsOffers} from "../lib/server/theme-product-provider";
it("資格未設定では通信せず、正常取得・欠品・通信失敗を別状態で返し秘密値を公開しない",async()=>{
 const previous=process.env.PRODUCTS_CREATORS_CONFIG;delete process.env.PRODUCTS_CREATORS_CONFIG;
 const fetcher=vi.fn();expect(await creatorsOffers(["book"],"JP",fetcher)).toEqual({provider:"unconfigured",offers:[]});expect(fetcher).not.toHaveBeenCalled();
 const dir=await mkdtemp(path.join(tmpdir(),"theme-products-"));
 try{
  const file=path.join(dir,"private.json");process.env.PRODUCTS_CREATORS_CONFIG=file;
  await writeFile(file,JSON.stringify({credentialVersion:"3.3",clientId:"fixture-client",clientSecret:"private-fixture-secret",partners:{JP:"fixture-22",US:"fixture-20"},items:[{productId:"book",asin:"B0GMV4CK32",marketplace:"JP"},{productId:"missing",asin:"142622382X",marketplace:"JP"},{productId:"book",asin:"B0GMV4CK32",marketplace:"US"}]}),{mode:0o600});
  fetcher.mockResolvedValueOnce(Response.json({access_token:"fixture-token",expires_in:3600})).mockResolvedValueOnce(Response.json({itemsResult:{items:[{asin:"B0GMV4CK32",detailPageURL:"https://www.amazon.co.jp/dp/B0GMV4CK32?tag=fixture-22",images:{primary:{medium:{url:"https://m.media-amazon.com/images/I/fixture.jpg",width:80,height:120}}}}]}}));
  const result=await creatorsOffers(["book","missing"],"JP",fetcher);expect(result.offers.map(o=>o.status)).toEqual(["ready","unavailable"]);expect(result.offers[0].image?.provider).toBe("creators-api");expect(JSON.stringify(result)).not.toMatch(/secret|fixture-token|clientId/);
  const before=fetcher.mock.calls.length;await creatorsOffers(["book","missing"],"JP",fetcher);expect(fetcher).toHaveBeenCalledTimes(before);
  fetcher.mockRejectedValueOnce(Error("offline"));expect((await creatorsOffers(["book"],"US",fetcher)).offers[0].status).toBe("error");
 }finally{await rm(dir,{recursive:true,force:true});if(previous)process.env.PRODUCTS_CREATORS_CONFIG=previous;else delete process.env.PRODUCTS_CREATORS_CONFIG;}
});
