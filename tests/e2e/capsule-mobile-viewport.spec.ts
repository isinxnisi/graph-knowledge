import { test, expect } from "@playwright/test";
import { selectContent, studio } from "./capsule-fixture";

test("mobile neighbor filters leave room for results and nested dialogs recover after viewport changes",async({page},info)=>{
 await page.goto("/");
 // This suite targets the existing public-kg preview; it only reads KG and
 // edits an unsaved guest draft. No account or shared contents are written.
 await page.getByRole("button",{name:"PLUTOから探索を開始",exact:true}).click();
 await page.getByRole("button",{name:"Capsule作成",exact:true}).click();
 await expect(studio(page)).toBeVisible();
 await selectContent(page,"PLUTO");
 await studio(page).getByRole("button",{name:"関係先から追加",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"KGの関係先",exact:true});
 await expect(dialog.getByRole("checkbox").first()).toBeVisible();
 await expect(dialog.getByRole("combobox")).toHaveCount(0);
 await expect(dialog.getByRole("button",{name:"関係先を閉じる"})).toBeFocused();
 const search=dialog.getByRole("searchbox",{name:"名前で絞り込み"});
 const first=await dialog.getByRole("checkbox").first().boundingBox(),bounds=await dialog.boundingBox();
 expect(first!.y-bounds!.y).toBeLessThan(180);
 await dialog.screenshot({path:info.outputPath("neighbors-mobile.png")});
 await dialog.getByRole("button",{name:"条件",exact:true}).click();
 await expect(dialog.getByRole("combobox")).toHaveCount(2);
 await dialog.getByRole("button",{name:"条件",exact:true}).click();
 await search.fill("浦沢");
 // Resize is a regression check for layout, not an emulation of iOS's OSK.
 await page.setViewportSize({width:390,height:330});
 await expect(search).toHaveValue("浦沢");
 await expect(dialog.getByRole("button",{name:"関係先を閉じる"})).toBeInViewport();
 await expect(dialog.getByRole("button",{name:"0件をまとめて追加"})).toBeInViewport();
 await dialog.screenshot({path:info.outputPath("neighbors-short-viewport.png")});
 await page.setViewportSize({width:390,height:660});
 await search.fill("");
 await dialog.getByRole("button",{name:"関係先を閉じる"}).click();
 expect(await page.locator("body").evaluate(el=>getComputedStyle(el).position)).toBe("fixed");
 await studio(page).getByRole("button",{name:"閉じる",exact:true}).click();
 const confirm=page.getByRole("dialog",{name:"変更を破棄しますか？",exact:true});
 if(await confirm.isVisible())await confirm.getByRole("button",{name:"変更を破棄",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"Capsule",exact:true})).toHaveCount(0);
 expect(await page.locator("body").evaluate(el=>getComputedStyle(el).position)).not.toBe("fixed");
 await page.getByRole("banner").getByRole("button",{name:"My Capsules",exact:true}).click();
 const library=page.getByRole("dialog",{name:"My Capsules",exact:true});await expect(library).toBeInViewport();
 await library.getByRole("button",{name:"一覧を閉じる"}).click();
 expect(await page.evaluate(()=>window.scrollY)).toBe(0);
 await page.setViewportSize({width:1280,height:800});
 await page.getByRole("button",{name:"Capsule作成",exact:true}).click();
 await expect(studio(page)).toBeInViewport();
 await page.screenshot({path:info.outputPath("capsule-desktop.png")});
});
