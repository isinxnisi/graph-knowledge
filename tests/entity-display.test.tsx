// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { entityDisplayName } from "../lib/domain/entity-display";
import { entityLabel } from "../lib/client/graph-presentation";
import { entitySummary } from "../lib/server/mappers";
import { UiLocaleProvider } from "../lib/client/ui-locale";
import StartExamples from "../components/StartExamples";
import EntitySearchResults from "../components/EntitySearchResults";
afterEach(cleanup);
it("uses registered spellings without translating or changing originals, and retains unknown names", () => {
  const entity = { name:"浦沢直樹", aliases:["Q483", "https://example.org", "Naoki Urasawa"] };
  expect(entityDisplayName(entity,"en-US")).toBe("Naoki Urasawa");
  expect(entityDisplayName(entity,"ja")).toBe("浦沢直樹");
  expect(entityDisplayName(entity,"fr")).toBe(entity.name);
  expect(entityDisplayName({name:"未訳の名前"},"en")).toBe("未訳の名前");
  expect(entityDisplayName({name:"Naoki Urasawa",aliases:["浦沢直樹"]},"ja")).toBe("浦沢直樹");
  expect(entity.name).toBe("浦沢直樹");
});
it("carries registered aliases through public summaries and disambiguates equal display names", () => {
  const one=entitySummary({id:"29e9caea-6c44-4c1f-9abc-f4350003ca3b",kind:"person",name:"長崎尚志",aliases:["Takashi Nagasaki"],description:"One"});
  const other={...one,id:"other",name:"別表記",description:"Two"};
  expect(one.aliases).toEqual(["Takashi Nagasaki"]);
  expect(entityLabel(one,{[one.id]:one,other},"en")).toBe("Takashi Nagasaki\nOne");
});
it("uses the same spelling in start cards and search while choosing the canonical entity", () => {
  const choose=vi.fn();
  render(<UiLocaleProvider initialLocale="en"><StartExamples dataset="public-kg" onChoose={choose}/></UiLocaleProvider>);
  fireEvent.click(screen.getByRole("button",{name:"Explore from Takashi Nagasaki"}));
  expect(choose.mock.calls[0][0].name).toBe("長崎尚志");
  expect(screen.getByText("University of Copenhagen Niels Bohr Institute")).toBeTruthy();
  cleanup();
  const entity={id:"29e9caea-6c44-4c1f-9abc-f4350003ca3b",kind:"person" as const,name:"長崎尚志",description:null,aliases:["Takashi Nagasaki"],event:null};
  render(<EntitySearchResults items={[entity]} locale="en" onChoose={choose}/>);
  expect(screen.getByText("Takashi Nagasaki")).toBeTruthy();
  expect(screen.getByText(/Aliases.*長崎尚志/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button"));
  expect(choose.mock.calls.at(-1)![0]).toBe(entity);
});
