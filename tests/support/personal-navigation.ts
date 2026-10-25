import {expect,type Page} from '@playwright/test';
export function personalSidebar(page:Page){return page.getByRole('navigation',{name:/Account and communities|アカウントとコミュニティ/,exact:true,includeHidden:true});}
export async function followPersonal(page:Page,label:string){
 const sidebar=personalSidebar(page);
 if(await sidebar.isVisible())await sidebar.getByRole('link',{name:label,exact:true}).click();
 else{await page.getByTestId('site-header').getByLabel(/Account menu|アカウントメニュー/,{exact:true}).click();await page.getByTestId('site-header').getByRole('navigation',{name:/Member menu|本人メニュー/,exact:true}).getByRole('link',{name:label,exact:true}).click();}
 await expect(sidebar.getByRole('link',{name:label,exact:true,includeHidden:true})).toHaveAttribute('aria-current','page');
}