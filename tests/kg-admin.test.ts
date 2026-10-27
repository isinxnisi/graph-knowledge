import { describe, expect, it } from "vitest";
import { analyzeAdminGraph, type RawEntity, type RawClaim, ADMIN_ENTITY_LIMIT } from "../lib/server/kg-admin-analysis";
import { adminInput, adminPage } from "../lib/domain/kg-admin";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const entity = (n: number): RawEntity => ({ id: id(n), name: `Name ${String(n).padStart(5, "0")}`, kind: n % 2 ? "person" : "work", aliases: [`Alias ${n}`] });
const claim = (n: number, a: number, b: number, extra = {}): RawClaim => ({ id: id(n + 100000), subjectId: id(a), objectId: id(b), visibility: "published", polarity: "affirmed", supported: true, ...extra });
const input = (s = "") => adminInput(new URLSearchParams(s));
describe("management complete graph", () => {
  it("keeps singletons, parallel Claims, denied/hidden/unsupported exclusions and self claims", () => {
    const r = analyzeAdminGraph([1,2,3,4,5,6].map(entity), [claim(1,1,2), claim(2,1,2), claim(3,2,3), claim(4,3,4,{polarity:"denied"}), claim(5,4,5,{visibility:"hidden"}), claim(6,5,6,{supported:false}), claim(7,6,6)], "r1");
    expect(r.islands.map(i=>i.size)).toEqual([3,1,1,1]); expect(r.claimCount).toBe(4);
    expect(r.entities.map(e=>e.degree)).toEqual([1,2,1,0,0,0]); expect(r.entities[0].claimCount).toBe(2);
    expect(r.distribution).toEqual([3,2,1,0]); expect(r.excluded).toEqual({unpublished:1,denied:1,unsupported:1});
    expect(analyzeAdminGraph([6,5,4,3,2,1].map(entity), [claim(3,2,3),claim(2,1,2),claim(1,1,2),claim(7,6,6)], "r1").islands.map(i=>i.id)).toEqual(r.islands.map(i=>i.id));
    expect(analyzeAdminGraph([1,2].map(entity), [claim(1,1,2)], "r2").islands[0].id).not.toBe(r.islands[0].id);
  });
  it("covers every row across both sorts and stable ties beyond Graph display limits", () => {
    const r = analyzeAdminGraph(Array.from({length:315},(_,i)=>entity(i+1)), [], "r");
    const all: string[] = [];
    for(let offset=0;offset<315;offset+=40) all.push(...adminPage(r,input(`view=entities&sort=kind&direction=desc&second=name&secondDirection=desc&revision=r&offset=${offset}`)).items.map(i=>i.id));
    expect(all).toHaveLength(315); expect(new Set(all).size).toBe(315); expect(all[0]).toBe(id(314));
    expect(adminPage(r,input("view=islands&min=1&max=1&sort=size&second=claimCount")).total).toBe(315);
    expect(adminPage(r,input("view=entities&degree=0&q=ALIAS%20315")).items[0].id).toBe(id(315));
  });
  it("searches all members of an Island and exact/open size ranges", () => {
    const r = analyzeAdminGraph([1,2,3,4].map(entity), [claim(1,1,2),claim(2,2,3)], "r");
    expect(adminPage(r,input("view=islands&q=Alias%203&min=3&max=3")).total).toBe(1);
    expect(adminPage(r,input("view=islands&min=4")).total).toBe(0);
    expect(adminPage(r,input("view=islands&max=1")).total).toBe(1);
    expect(adminPage(r,input("view=islands&min=999999999999999")).total).toBe(0);
    expect(adminPage(r,input(`view=entities&island=${r.islands[0].id}&revision=r`)).total).toBe(3);
  });
  it("rejects stale revisions, invalid/duplicate/unsafe inputs and malformed snapshots", () => {
    for(const q of ["min=-1","min=1.5","min=3&max=2","min=9007199254740992","limit=101","q=a&q=b","sort=unknown","offset=1","island=x","unknown=x"]) expect(()=>input(q)).toThrow();
    expect(input("sort=name&second=name").second).toBeUndefined();
    const r = analyzeAdminGraph([entity(1)],[],"r"); expect(()=>adminPage(r,input("revision=old"))).toThrow("DATASET_CHANGED");
    expect(()=>analyzeAdminGraph([entity(1)],[claim(1,1,2)],"r")).toThrow();
    expect(()=>analyzeAdminGraph([entity(1),entity(1)],[],"r")).toThrow();
    expect(()=>analyzeAdminGraph(Array.from({length:ADMIN_ENTITY_LIMIT+1},(_,i)=>entity(i)),[],"r")).toThrow("capacity");
  });
  it("handles a large component without recursive stack growth", () => {
    const r=analyzeAdminGraph(Array.from({length:12000},(_,i)=>entity(i)),Array.from({length:11999},(_,i)=>claim(i,i,i+1)),"large");
    expect(r.islands).toHaveLength(1); expect(r.islands[0].size).toBe(12000); expect(r.islands[0].claimCount).toBe(11999);
  });
});
