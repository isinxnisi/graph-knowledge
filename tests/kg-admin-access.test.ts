import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { adminAuthorized, adminConfiguration, verifyAdminJwt, ADMIN_HOST } from "../lib/server/kg-admin-access";
const pair = await generateKeyPair("RS256"), jwk = await exportJWK(pair.publicKey);
const keys = createLocalJWKSet({ keys: [{...jwk, kid:"test", alg:"RS256"}] });
const config = {issuer:"https://test.cloudflareaccess.com",audience:"a".repeat(64)};
const token = (overrides={}) => new SignJWT({email:"admin@example.invalid",type:"app",...overrides}).setProtectedHeader({alg:"RS256",kid:"test"}).setIssuer(config.issuer).setAudience(config.audience).setSubject("admin").setIssuedAt().setExpirationTime("5m").sign(pair.privateKey);
beforeEach(()=>vi.unstubAllEnvs());
describe("management Access boundary",()=>{
  it("verifies a signed app JWT and rejects wrong audience, issuer, expiration, signature and service tokens", async()=>{
    const jwt=await token(); expect(await verifyAdminJwt(jwt,config,keys)).toBe(true);
    await expect(verifyAdminJwt(jwt,{...config,audience:"b".repeat(64)},keys)).rejects.toThrow();
    await expect(verifyAdminJwt(jwt,{...config,issuer:"https://other.cloudflareaccess.com"},keys)).rejects.toThrow();
    const expired=await new SignJWT({email:"x",type:"app"}).setProtectedHeader({alg:"RS256",kid:"test"}).setIssuer(config.issuer).setAudience(config.audience).setSubject("x").setIssuedAt(1).setExpirationTime(2).sign(pair.privateKey);
    await expect(verifyAdminJwt(expired,config,keys)).rejects.toThrow();
    const other=await generateKeyPair("RS256"); const bad=await new SignJWT({}).setProtectedHeader({alg:"RS256",kid:"test"}).sign(other.privateKey);
    await expect(verifyAdminJwt(bad,config,keys)).rejects.toThrow();
    expect(await verifyAdminJwt(await token({type:"service"}),config,keys)).toBe(false);
  });
  it("fails closed for disabled public runtimes, host/forwarded-host spoofing and absent JWT",async()=>{
    expect(adminConfiguration()).toBeNull();
    vi.stubEnv("KG_ADMIN_ENABLED","1"); vi.stubEnv("GRAPH_DATASET","public-kg"); vi.stubEnv("KG_ADMIN_ACCESS_TEAM","test"); vi.stubEnv("KG_ADMIN_ACCESS_AUD",config.audience);
    expect(adminConfiguration()).toEqual(config);
    for(const host of [ADMIN_HOST,"plunode.net","graph-beta.isinxnisi.com","127.0.0.1:3210"]) expect(await adminAuthorized(new Headers({host,"x-forwarded-host":ADMIN_HOST,"cf-access-authenticated-user-email":"admin@example.invalid"}))).toBe(false);
    vi.stubEnv("GRAPH_FILM_BETA","1"); expect(adminConfiguration()).toBeNull();
  });
});
