-- OAuth provider tables for the collection-only ChatGPT connection.
-- Generated from the pinned Better Auth 1.7.7 plugin schema; additive only.
create table "mission_oauth_jwks" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" timestamptz not null, "expiresAt" timestamptz, "alg" text, "crv" text);

create table "mission_oauth_client" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" boolean, "skipConsent" boolean, "enableEndSession" boolean, "subjectType" text, "scopes" jsonb, "clientCredentialsScopes" jsonb, "userId" uuid references "user" ("id") on delete cascade, "createdAt" timestamptz, "updatedAt" timestamptz, "name" text, "uri" text, "icon" text, "contacts" jsonb, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" jsonb not null, "postLogoutRedirectUris" jsonb, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" boolean, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" jsonb, "responseTypes" jsonb, "requirePKCE" boolean, "dpopBoundAccessTokens" boolean, "referenceId" text, "metadata" jsonb);

create table "mission_oauth_resource" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" jsonb, "customClaims" jsonb, "dpopBoundAccessTokensRequired" boolean, "disabled" boolean, "createdAt" timestamptz, "updatedAt" timestamptz, "policyVersion" integer, "metadata" jsonb);

create table "mission_oauth_client_resource" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "clientId" text not null references "mission_oauth_client" ("clientId") on delete cascade, "resourceId" text not null references "mission_oauth_resource" ("identifier") on delete cascade, "metadata" jsonb, "createdAt" timestamptz);

create table "mission_oauth_refresh_token" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "token" text not null unique, "clientId" text not null references "mission_oauth_client" ("clientId") on delete cascade, "sessionId" uuid references "session" ("id") on delete set null, "userId" uuid not null references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "rotatedAt" timestamptz, "rotationReplayResponse" text, "rotationReplayExpiresAt" timestamptz, "authTime" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

create table "mission_oauth_access_token" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "token" text not null unique, "clientId" text not null references "mission_oauth_client" ("clientId") on delete cascade, "sessionId" uuid references "session" ("id") on delete set null, "userId" uuid references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "refreshId" uuid references "mission_oauth_refresh_token" ("id") on delete cascade, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

create table "mission_oauth_consent" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "clientId" text not null references "mission_oauth_client" ("clientId") on delete cascade, "userId" uuid references "user" ("id") on delete cascade, "referenceId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "scopes" jsonb not null, "createdAt" timestamptz not null, "updatedAt" timestamptz not null);

create table "mission_oauth_client_assertion" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "expiresAt" timestamptz not null);

create index "mission_oauth_client_userId_idx" on "mission_oauth_client" ("userId");

create index "mission_oauth_client_resource_clientId_idx" on "mission_oauth_client_resource" ("clientId");

create index "mission_oauth_client_resource_resourceId_idx" on "mission_oauth_client_resource" ("resourceId");

create index "mission_oauth_refresh_token_clientId_idx" on "mission_oauth_refresh_token" ("clientId");

create index "mission_oauth_refresh_token_sessionId_idx" on "mission_oauth_refresh_token" ("sessionId");

create index "mission_oauth_refresh_token_userId_idx" on "mission_oauth_refresh_token" ("userId");

create index "mission_oauth_refresh_token_authorizationCodeId_idx" on "mission_oauth_refresh_token" ("authorizationCodeId");

create index "mission_oauth_access_token_clientId_idx" on "mission_oauth_access_token" ("clientId");

create index "mission_oauth_access_token_sessionId_idx" on "mission_oauth_access_token" ("sessionId");

create index "mission_oauth_access_token_userId_idx" on "mission_oauth_access_token" ("userId");

create index "mission_oauth_access_token_authorizationCodeId_idx" on "mission_oauth_access_token" ("authorizationCodeId");

create index "mission_oauth_access_token_refreshId_idx" on "mission_oauth_access_token" ("refreshId");

create index "mission_oauth_consent_clientId_idx" on "mission_oauth_consent" ("clientId");

create index "mission_oauth_consent_userId_idx" on "mission_oauth_consent" ("userId");

create unique index "mission_oauth_client_resource_clientId_resourceId_uidx" on "mission_oauth_client_resource" ("clientId", "resourceId");