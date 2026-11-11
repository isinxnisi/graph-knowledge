// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import MobileDisplayCheck from "../components/MobileDisplayCheck";
afterEach(()=>{cleanup();history.replaceState(null,"","/");document.documentElement.removeAttribute("style");vi.unstubAllGlobals();});
it("通常の閲覧では表示も文字補正も変更しない",()=>{
 history.replaceState(null,"","/t/example");
 document.documentElement.style.setProperty("-webkit-text-size-adjust","125%");
 render(<MobileDisplayCheck/>);
 expect(screen.queryByLabelText("表示の計測")).toBeNull();
 expect(document.documentElement.style.getPropertyValue("-webkit-text-size-adjust")).toBe("125%");
});
it("明示したβ計測でだけ比較し、終了すると元の文字補正へ戻る",async()=>{
 history.replaceState(null,"","/?displayCheck=1");
 document.documentElement.style.setProperty("text-size-adjust","125%");
 const {unmount}=render(<MobileDisplayCheck/>);
 fireEvent.click(await screen.findByRole("button",{name:"文字補正100%と比較"}));
 await waitFor(()=>expect(document.documentElement.style.getPropertyValue("text-size-adjust")).toBe("100%"));
 unmount();
 expect(document.documentElement.style.getPropertyValue("text-size-adjust")).toBe("125%");
});
